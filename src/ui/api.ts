/**
 * Client calls to the real endpoints, with a structural check of the response
 * so the UI never renders from an unexpected shape.
 */
import type { AnalyzeRequest, AnalyzeResponse, SampleResponse } from "../contract";

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

const RUN_STATUSES = ["completed", "completed_empty", "completed_partial", "failed"];

export function isAnalyzeResponse(x: unknown): x is AnalyzeResponse {
  if (!isRecord(x)) return false;
  if (x.mode !== "live" && x.mode !== "replay") return false;
  const t = x.transcripts;
  if (!isRecord(t) || typeof t.A !== "string" || typeof t.B !== "string") return false;
  const run = x.run;
  if (!isRecord(run) || typeof run.status !== "string" || !RUN_STATUSES.includes(run.status)) return false;
  if (run.status === "failed") return typeof run.reason === "string" && typeof run.detail === "string";
  return Array.isArray(run.results);
}

export function isSampleResponse(x: unknown): x is SampleResponse {
  return isRecord(x) && typeof x.transcriptA === "string" && typeof x.transcriptB === "string";
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function errorMessage(body: unknown, status: number): string {
  if (isRecord(body) && typeof body.error === "string") return `${body.error} (HTTP ${status})`;
  return `The server responded with HTTP ${status}.`;
}

export async function postAnalyze(req: AnalyzeRequest, signal?: AbortSignal): Promise<AnalyzeResponse> {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    signal,
  });
  const body = await readJson(res);
  if (!res.ok) throw new Error(errorMessage(body, res.status));
  if (!isAnalyzeResponse(body)) throw new Error("The server returned a response in an unexpected format.");
  return body;
}

export async function getSample(signal?: AbortSignal): Promise<SampleResponse> {
  const res = await fetch("/api/sample", { signal });
  const body = await readJson(res);
  if (!res.ok) throw new Error(errorMessage(body, res.status));
  if (!isSampleResponse(body)) throw new Error("The sample endpoint returned an unexpected format.");
  return body;
}
