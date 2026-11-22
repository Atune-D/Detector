/**
 * Transcripts -> extraction (one call per transcript) -> nomination -> engine.
 * No scoring here: buildCandidates + analyzeRun from the engine decide everything.
 */
import { analyzeRun, buildCandidates, failedRun, type Fact, type Nomination, type UpstreamFailure } from "@/engine";
import type { AnalyzeRequest, AnalyzeResponse } from "@/contract";
import { LlmTransportError, type LlmClient, type LlmRequest } from "./llm/client";
import { EXTRACTION_SYSTEM, NOMINATION_SYSTEM, extractionUserMessage, nominationUserMessage } from "./llm/prompts";
import { extractionJsonSchema, extractionZod, findForbiddenKey, nominationJsonSchema, nominationZod } from "./llm/schema";
import { toFacts } from "./facts";
import { parseTranscript, type ParsedTranscript } from "./transcript";
import { isSampleRequest, replayClient } from "./replay";

export const NO_KEY_DETAIL =
  "No ANTHROPIC_API_KEY is set, so these transcripts cannot be analysed. Set ANTHROPIC_API_KEY (see .env.example) or load the bundled sample, which runs from a saved extraction.";

type Step<T> = { ok: true; value: T } | { ok: false; reason: UpstreamFailure; detail: string };

const fail = (reason: UpstreamFailure, detail: string): { ok: false; reason: UpstreamFailure; detail: string } => ({ ok: false, reason, detail });

/** One LLM call: transport errors, stop reasons, JSON parsing, forbidden fields, strict schema. */
async function callJson<T>(llm: LlmClient, req: LlmRequest, parse: (v: unknown) => { success: true; data: T } | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } }): Promise<Step<T>> {
  const label = req.purpose === "nominate" ? "pair nomination" : `extraction of transcript ${req.purpose.slice(-1)}`;
  let raw;
  try {
    raw = await llm.complete(req);
  } catch (err) {
    if (err instanceof LlmTransportError) return fail(err.failure, `${label}: ${err.message}`);
    return fail("upstream_missing", `${label}: the model call failed unexpectedly.`);
  }
  if (raw.stopReason === "max_tokens" || raw.stopReason === "model_context_window_exceeded") {
    return fail("truncated", `${label}: the model response was cut off (stop reason ${raw.stopReason}).`);
  }
  if (raw.stopReason === "refusal") return fail("upstream_missing", `${label}: the model declined to respond.`);
  if (raw.stopReason !== "end_turn" && raw.stopReason !== "stop_sequence") {
    return fail("upstream_missing", `${label}: unexpected stop reason ${String(raw.stopReason)}.`);
  }
  if (raw.text === null || raw.text.trim() === "") return fail("upstream_missing", `${label}: the model returned no content.`);

  let json: unknown;
  try {
    json = JSON.parse(raw.text);
  } catch {
    return fail("malformed", `${label}: the response is not valid JSON.`);
  }
  const forbidden = findForbiddenKey(json);
  if (forbidden) return fail("malformed", `${label}: the response contains a judgement field (${forbidden}); the model may not score or judge.`);
  const parsed = parse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue ? issue.path.map(String).join(".") || "$" : "$";
    return fail("malformed", `${label}: the response does not match the schema at ${where}: ${issue?.message ?? "invalid"}.`);
  }
  return { ok: true, value: parsed.data };
}

async function extract(llm: LlmClient, id: "A" | "B", parsed: ParsedTranscript): Promise<Step<Fact[]>> {
  if (parsed.qa.length === 0) return { ok: true, value: [] };
  const ids = parsed.qa.map((q) => q.id);
  const zod = extractionZod(ids);
  const step = await callJson(
    llm,
    { purpose: id === "A" ? "extract_A" : "extract_B", system: EXTRACTION_SYSTEM, user: extractionUserMessage(parsed), schema: extractionJsonSchema(ids) },
    (v) => zod.safeParse(v),
  );
  return step.ok ? { ok: true, value: toFacts(id, parsed, step.value.facts) } : step;
}

async function nominate(llm: LlmClient, factsA: Fact[], factsB: Fact[]): Promise<Step<Nomination[]>> {
  if (factsA.length === 0 || factsB.length === 0) return { ok: true, value: [] };
  const idsA = factsA.map((f) => f.id);
  const idsB = factsB.map((f) => f.id);
  const zod = nominationZod(idsA, idsB);
  const step = await callJson(
    llm,
    { purpose: "nominate", system: NOMINATION_SYSTEM, user: nominationUserMessage(factsA, factsB), schema: nominationJsonSchema(idsA, idsB) },
    (v) => zod.safeParse(v),
  );
  if (!step.ok) return step;
  return { ok: true, value: step.value.nominations.map((n) => ({ factIdA: n.factIdA, factIdB: n.factIdB, kind: n.kind, templateId: n.templateId, reason: n.reason })) };
}

export interface PipelineDeps {
  /** Live client; null when no API key is configured. */
  llm: LlmClient | null;
}

export async function runPipeline(req: AnalyzeRequest, deps: PipelineDeps): Promise<AnalyzeResponse> {
  const transcripts = { A: req.transcriptA, B: req.transcriptB };
  const replay = isSampleRequest(req);
  const llm = replay ? replayClient() : deps.llm;
  const mode = replay ? "replay" : "live";
  const empty = { A: [], B: [] };

  if (!llm) return { mode, run: failedRun("upstream_missing", NO_KEY_DETAIL), transcripts, facts: empty };

  const parsedA = parseTranscript(transcripts.A);
  const parsedB = parseTranscript(transcripts.B);
  // Each transcript is extracted in its own call and never sees the other one.
  const [a, b] = await Promise.all([extract(llm, "A", parsedA), extract(llm, "B", parsedB)]);
  if (!a.ok) return { mode, run: failedRun(a.reason, a.detail), transcripts, facts: { A: [], B: b.ok ? b.value : [] } };
  if (!b.ok) return { mode, run: failedRun(b.reason, b.detail), transcripts, facts: { A: a.value, B: [] } };
  const facts = { A: a.value, B: b.value };

  const n = await nominate(llm, facts.A, facts.B);
  if (!n.ok) return { mode, run: failedRun(n.reason, n.detail), transcripts, facts };

  const { candidates } = buildCandidates(facts.A, facts.B, n.value);
  return { mode, run: analyzeRun(candidates, transcripts), transcripts, facts };
}
