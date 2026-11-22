/**
 * HTTP handling for POST /api/analyze, kept out of the route file so tests can
 * inject a fake LLM client. 400 only for a malformed body; anything the pipeline
 * handled (including a failed run) is 200 with an AnalyzeResponse.
 */
import type { AnalyzeRequest, AnalyzeResponse } from "@/contract";
import type { LlmClient } from "./llm/client";
import { runPipeline } from "./pipeline";

function isAnalyzeRequest(v: unknown): v is AnalyzeRequest {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>;
  return typeof r.transcriptA === "string" && typeof r.transcriptB === "string";
}

export async function handleAnalyze(request: Request, makeClient: () => LlmClient | null): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be JSON: { transcriptA: string, transcriptB: string }." }, { status: 400 });
  }
  if (!isAnalyzeRequest(body)) {
    return Response.json({ error: "Request body must be { transcriptA: string, transcriptB: string }." }, { status: 400 });
  }
  const result: AnalyzeResponse = await runPipeline({ transcriptA: body.transcriptA, transcriptB: body.transcriptB }, { llm: makeClient() });
  return Response.json(result, { status: 200 });
}
