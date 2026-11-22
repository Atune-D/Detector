/**
 * Candidate -> quote validation -> comparator -> score, and the run-level result (§5).
 */
import { POLICY, type Policy } from "./config";
import { compareCandidate } from "./dispatch";
import { validateQuote } from "./quote";
import { scoreCompareResult } from "./scoring";
import type { AnalysisError, Candidate, CandidateResult, RunResult, Transcripts, UpstreamFailure } from "./types";

export function analyzeCandidate(candidate: Candidate, transcripts: Transcripts, policy: Policy = POLICY): CandidateResult {
  const errors: AnalysisError[] = [];
  for (const f of [candidate.a, candidate.b]) {
    const s = f.source;
    const check = validateQuote(transcripts[s.transcript], s.quote, s.start, s.end);
    if (!check.ok) errors.push({ code: "quote_invalid", factId: f.id, detail: check.reason });
  }
  if (errors.length > 0) {
    return { candidate, category: "analysis_error", score: null, compare: null, record: null, errors };
  }
  const compare = compareCandidate(candidate, policy);
  const scored = scoreCompareResult(compare, [candidate.a, candidate.b], policy);
  return { candidate, category: scored.category, score: scored.score, compare, record: scored.record, errors: [] };
}

/** Run over already-built candidates. Upstream failures are reported with `failedRun` instead. */
export function analyzeRun(candidates: readonly Candidate[], transcripts: Transcripts, policy: Policy = POLICY): RunResult {
  if (candidates.length === 0) return { status: "completed_empty", results: [] };
  const results = candidates.map((c) => analyzeCandidate(c, transcripts, policy));
  const errorCount = results.filter((r) => r.category === "analysis_error").length;
  return errorCount > 0 ? { status: "completed_partial", results, errorCount } : { status: "completed", results };
}

export function failedRun(reason: UpstreamFailure, detail: string): RunResult {
  return { status: "failed", reason, detail };
}
