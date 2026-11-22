import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import type { AnalyzeResponse } from "../../src/contract";
import type { CandidateResult, RunResult } from "../../src/engine";
import { handleAnalyze } from "../../src/server/http";
import { LlmTransportError, mapSdkError } from "../../src/server/llm/client";
import { NO_KEY_DETAIL, runPipeline } from "../../src/server/pipeline";
import { FakeLlm, evening, instant, ok, xfact, type Script } from "./fakeLlm";

const D = "2022-03-03";
const A = `Deposition of J. Doe — June 1, 2022

Q: Where were you on the evening of March 3rd?
A: I was at home all evening.

Q: What time did you go to sleep?
A: Around 10.
`;
const B = `Deposition of J. Doe — July 1, 2022

Q: Where were you on the evening of March 3rd?
A: I went out around 8 to see a friend.

Q: What time did you go to sleep?
A: About 10.
`;

const factsA = [
  xfact("Q1", "I was at home all evening", "location.home", evening(D)),
  xfact("Q2", "Around 10", "sleep_onset", instant(D, "22:00", "Around 10", [{ text: "Around", class: "approx" }])),
];
const factsB = [
  xfact("Q1", "I went out around 8", "location.out", instant(D, "20:00", "around 8", [{ text: "around", class: "approx" }])),
  xfact("Q2", "About 10", "sleep_onset", instant(D, "22:00", "About 10", [{ text: "About", class: "approx" }])),
];

function script(over: Partial<Record<"extract_A" | "extract_B" | "nominate", Script>> = {}) {
  return new FakeLlm({ extract_A: ok({ facts: factsA }), extract_B: ok({ facts: factsB }), nominate: ok({ nominations: [] }), ...over });
}

const run = (llm: FakeLlm | null, a = A, b = B) => runPipeline({ transcriptA: a, transcriptB: b }, { llm });

function failed(run: RunResult) {
  if (run.status !== "failed") throw new Error(`expected failed, got ${run.status}`);
  return run;
}

function results(run: RunResult): CandidateResult[] {
  if (run.status === "failed") throw new Error(`run failed: ${run.detail}`);
  return run.results;
}

describe("pipeline with a fake LLM client", () => {
  it("live happy path: offsets computed by our code, engine scores", async () => {
    const res = await run(script());
    expect(res.mode).toBe("live");
    expect(res.transcripts).toEqual({ A, B });
    expect(res.run.status).toBe("completed");
    for (const f of [...res.facts.A, ...res.facts.B]) {
      const text = f.source.transcript === "A" ? A : B;
      expect(text.slice(f.source.start, f.source.end)).toBe(f.source.quote);
    }
    const byKind = Object.fromEntries(results(res.run).map((r) => [r.candidate.kind, r]));
    expect(byKind.state?.category).toBe("direct");
    expect(byKind.state?.score).toBe(85);
    expect(byKind.event_time?.category).toBe("false_positive");
    // Time marker spans are located inside the quote.
    const t = res.facts.B[0]?.time;
    const span = t?.kind === "instant" ? t.markers[0]?.span : undefined;
    expect(span && B.slice(span.start, span.end)).toBe("around");
  });

  it("extracts each transcript in its own call that never sees the other transcript", async () => {
    const llm = script();
    await run(llm);
    const a = llm.requests.find((r) => r.purpose === "extract_A");
    const b = llm.requests.find((r) => r.purpose === "extract_B");
    expect(a?.user).toContain("I was at home all evening.");
    expect(a?.user).toContain("June 1, 2022");
    expect(a?.user).not.toContain("I went out around 8");
    expect(b?.user).toContain("I went out around 8");
    expect(b?.user).not.toContain("I was at home all evening");
  });

  it("malformed JSON -> failed: malformed", async () => {
    const r = failed((await run(script({ extract_A: { stopReason: "end_turn", text: '{"facts": [' } }))).run);
    expect(r.reason).toBe("malformed");
    expect(r.detail).toMatch(/transcript A/);
  });

  it("an unknown extra field (confidence) -> failed: malformed", async () => {
    const bad = [{ ...factsA[0], confidence: 0.92 }, factsA[1]];
    const r = failed((await run(script({ extract_A: ok({ facts: bad }) }))).run);
    expect(r.reason).toBe("malformed");
    expect(r.detail).toContain("confidence");
  });

  it("any other unknown field, or a missing field -> failed: malformed", async () => {
    const extra = failed((await run(script({ extract_B: ok({ facts: [{ ...factsB[0], note: "x" }] }) }))).run);
    expect(extra.reason).toBe("malformed");
    const { polarity: _omit, ...missing } = factsB[0] as Record<string, unknown>;
    const miss = failed((await run(script({ extract_B: ok({ facts: [missing] }) }))).run);
    expect(miss.reason).toBe("malformed");
    expect(miss.detail).toContain("polarity");
  });

  it("an out-of-vocabulary predicate -> failed: malformed", async () => {
    const r = failed((await run(script({ extract_A: ok({ facts: [{ ...factsA[0], action: "location.office" }] }) }))).run);
    expect(r.reason).toBe("malformed");
    expect(r.detail).toContain("action");
  });

  it("out-of-vocabulary period, unknown qaId, or inconsistent negation form -> failed: malformed", async () => {
    const period = failed((await run(script({ extract_A: ok({ facts: [{ ...factsA[0], time: { kind: "period", original: "that night", date: D, period: "night" } }] }) }))).run);
    expect(period.reason).toBe("malformed");
    const qa = failed((await run(script({ extract_A: ok({ facts: [{ ...factsA[0], qaId: "Q9" }] }) }))).run);
    expect(qa.reason).toBe("malformed");
    const neg = failed((await run(script({ extract_A: ok({ facts: [{ ...factsA[0], polarity: "negative", negationForm: null }] }) }))).run);
    expect(neg.reason).toBe("malformed");
    expect(neg.detail).toContain("negationForm");
  });

  it("an unlocatable quote -> analysis_error for that fact's candidates; partial run; other candidates intact", async () => {
    const reworded = [{ ...factsA[0], quote: "I was at home the whole evening" }, factsA[1]];
    const res = await run(script({ extract_A: ok({ facts: reworded }) }));
    expect(res.run.status).toBe("completed_partial");
    if (res.run.status !== "completed_partial") return;
    expect(res.run.errorCount).toBe(1);
    // The fact is kept (not dropped, not repaired): its quote is the model's text, offsets are the sentinel.
    expect(res.facts.A[0]?.source).toMatchObject({ quote: "I was at home the whole evening", start: -1, end: -1 });
    const err = res.run.results.find((r) => r.category === "analysis_error");
    expect(err?.candidate.kind).toBe("state");
    expect(err?.errors[0]).toMatchObject({ code: "quote_invalid", factId: "A1" });
    const intact = res.run.results.find((r) => r.candidate.kind === "event_time");
    expect(intact?.category).toBe("false_positive");
  });

  it("a quote that exists only in a different answer than the named qaId is not located", async () => {
    const wrongPair = [{ ...factsA[0], qaId: "Q2" }, factsA[1]];
    const res = await run(script({ extract_A: ok({ facts: wrongPair }) }));
    expect(res.facts.A[0]?.source.start).toBe(-1);
    expect(res.run.status).toBe("completed_partial");
  });

  it("an uncertainty marker missing from the quote makes the fact unlocated", async () => {
    const res = await run(script({ extract_B: ok({ facts: [{ ...factsB[0], uncertaintyMarkers: [{ text: "I think", modifies: "action" }] }, factsB[1]] }) }));
    expect(res.facts.B[0]?.source.start).toBe(-1);
    expect(res.run.status).toBe("completed_partial");
  });

  it("timeout -> failed: upstream_timeout", async () => {
    const r = failed((await run(script({ extract_B: new LlmTransportError("upstream_timeout", "The model API did not respond in time.") }))).run);
    expect(r.reason).toBe("upstream_timeout");
  });

  it("SDK errors map to run-level failure reasons", () => {
    expect(mapSdkError(new Anthropic.APIConnectionTimeoutError()).failure).toBe("upstream_timeout");
    expect(mapSdkError(new Anthropic.APIConnectionError({ message: "down" })).failure).toBe("upstream_missing");
    expect(mapSdkError(new Error("boom")).failure).toBe("upstream_missing");
  });

  it("truncated response (stop reason max_tokens) -> failed: truncated", async () => {
    const r = failed((await run(script({ extract_A: { stopReason: "max_tokens", text: '{"facts": [' } }))).run);
    expect(r.reason).toBe("truncated");
  });

  it("missing or empty response, or a refusal -> failed: upstream_missing", async () => {
    expect(failed((await run(script({ extract_A: { stopReason: "end_turn", text: null } }))).run).reason).toBe("upstream_missing");
    expect(failed((await run(script({ extract_A: { stopReason: "end_turn", text: "  " } }))).run).reason).toBe("upstream_missing");
    expect(failed((await run(script({ nominate: { stopReason: "refusal", text: null } }))).run).reason).toBe("upstream_missing");
  });

  it("two consistent transcripts with zero candidates -> completed_empty, not failed", async () => {
    const same = `Q: Where were you on the evening of March 3rd?\nA: I was at home all evening.\n`;
    const home = [xfact("Q1", "I was at home all evening", "location.home", evening(D))];
    const res = await run(script({ extract_A: ok({ facts: home }), extract_B: ok({ facts: home }) }), same, same);
    expect(res.run).toEqual({ status: "completed_empty", results: [] });
    expect(res.facts.A).toHaveLength(1);
  });

  it("no key + non-sample input -> failed with the key message, no LLM call", async () => {
    const res = await run(null);
    expect(res.mode).toBe("live");
    const r = failed(res.run);
    expect(r.reason).toBe("upstream_missing");
    expect(r.detail).toBe(NO_KEY_DETAIL);
    expect(r.detail).toContain("ANTHROPIC_API_KEY");
  });

  it("nominations: valid ones become candidates; an unknown fact id is malformed", async () => {
    const nom = ok({ nominations: [{ factIdA: "A2", factIdB: "B1", kind: "state", templateId: null, reason: "r" }] });
    const res = await run(script({ nominate: nom }));
    expect(results(res.run).some((r) => r.candidate.origins.includes("nomination"))).toBe(true);
    const bad = ok({ nominations: [{ factIdA: "A9", factIdB: "B1", kind: "state", templateId: null, reason: "r" }] });
    expect(failed((await run(script({ nominate: bad }))).run).reason).toBe("malformed");
  });
});

describe("POST /api/analyze handler", () => {
  const post = (body: string) => new Request("http://localhost/api/analyze", { method: "POST", body, headers: { "content-type": "application/json" } });

  it("400 only for a malformed request body", async () => {
    expect((await handleAnalyze(post("not json"), () => null)).status).toBe(400);
    expect((await handleAnalyze(post(JSON.stringify({ transcriptA: "x" })), () => null)).status).toBe(400);
    expect((await handleAnalyze(post(JSON.stringify({ transcriptA: 1, transcriptB: "y" })), () => null)).status).toBe(400);
  });

  it("200 with a failed run when the pipeline handled it (no key)", async () => {
    const res = await handleAnalyze(post(JSON.stringify({ transcriptA: A, transcriptB: B })), () => null);
    expect(res.status).toBe(200);
    const body = (await res.json()) as AnalyzeResponse;
    expect(body.run.status).toBe("failed");
    expect(body.transcripts).toEqual({ A, B });
  });

  it("200 with a failed run for an upstream failure", async () => {
    const res = await handleAnalyze(post(JSON.stringify({ transcriptA: A, transcriptB: B })), () => script({ extract_A: { stopReason: "max_tokens", text: "{" } }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as AnalyzeResponse).run).toMatchObject({ status: "failed", reason: "truncated" });
  });
});
