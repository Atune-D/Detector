/**
 * Pure view-model helpers: grouping, sorting, score display, highlight marks.
 * Components stay thin; behaviour lives here and is unit-tested.
 */
import type { CandidateResult, Category, Fact, RunResult, TranscriptId } from "../engine";
import { CATEGORY_LABEL, STATUS_LABEL } from "./explain";
import { sliceRange, type Mark, type Tone } from "./segments";

/** A result plus a stable key used for DOM ids and highlight ids. */
export interface Finding {
  key: string;
  /** Position in the engine's result list. */
  index: number;
  result: CandidateResult;
}

export interface Groups {
  /** direct + inferential, score descending (ties keep engine order). */
  contradictions: Finding[];
  needsReview: Finding[];
  dismissed: Finding[];
  errors: Finding[];
}

export function findingKey(index: number): string {
  return `f${index}`;
}

export function toFindings(results: readonly CandidateResult[]): Finding[] {
  return results.map((result, index) => ({ key: findingKey(index), index, result }));
}

export function isContradiction(c: Category): c is "direct" | "inferential" {
  return c === "direct" || c === "inferential";
}

export function groupFindings(findings: readonly Finding[]): Groups {
  const g: Groups = { contradictions: [], needsReview: [], dismissed: [], errors: [] };
  for (const f of findings) {
    switch (f.result.category) {
      case "direct":
      case "inferential":
        g.contradictions.push(f);
        break;
      case "needs_review":
        g.needsReview.push(f);
        break;
      case "false_positive":
        g.dismissed.push(f);
        break;
      case "analysis_error":
        g.errors.push(f);
        break;
    }
  }
  const score = (f: Finding) => f.result.score ?? -Infinity;
  g.contradictions.sort((x, y) => score(y) - score(x) || x.index - y.index);
  return g;
}

export function resultsOf(run: RunResult): CandidateResult[] {
  return run.status === "failed" ? [] : run.results;
}

// ---------------------------------------------------------------------------
// Score / status display
// ---------------------------------------------------------------------------

export type ScoreDisplay = { kind: "score"; text: string } | { kind: "status"; text: string };

/**
 * A number is shown only for a scored contradiction. Everything else shows a
 * status label — an unscored result is never rendered as "0".
 */
export function scoreDisplay(r: Pick<CandidateResult, "category" | "score">): ScoreDisplay {
  if (isContradiction(r.category) && typeof r.score === "number" && Number.isFinite(r.score)) {
    return { kind: "score", text: String(r.score) };
  }
  return { kind: "status", text: STATUS_LABEL[r.category] };
}

export function categoryLabel(c: Category): string {
  return CATEGORY_LABEL[c];
}

/** "−10: 'I think' in Transcript B" — marker text sliced from the transcript by its offsets when possible. */
export function deductionText(r: CandidateResult, transcripts: Readonly<Record<TranscriptId, string>>): string | null {
  const d = r.record?.deduction;
  if (!d) return null;
  const marker = sliceRange(transcripts[d.transcript], d.start, d.end) ?? d.markerText;
  return `−${d.amount}: ‘${marker}’ in Transcript ${d.transcript}`;
}

// ---------------------------------------------------------------------------
// Quotes and highlight marks
// ---------------------------------------------------------------------------

export interface QuoteView {
  transcript: TranscriptId;
  question: string;
  /** Text sliced from the transcript at the fact's offsets, or the claimed quote when the offsets are unusable. */
  text: string;
  located: boolean;
}

/** The two facts of a result, ordered A then B. */
export function factsOf(r: CandidateResult): [Fact, Fact] {
  return [r.candidate.a, r.candidate.b];
}

export function quoteView(f: Fact, transcripts: Readonly<Record<TranscriptId, string>>): QuoteView {
  const s = f.source;
  const sliced = sliceRange(transcripts[s.transcript], s.start, s.end);
  return { transcript: s.transcript, question: s.question, text: sliced ?? s.quote, located: sliced !== null };
}

export function toneFor(c: Category): Tone | null {
  switch (c) {
    case "direct":
    case "inferential":
      return "contradiction";
    case "needs_review":
      return "review";
    case "false_positive":
      return "dismissed";
    case "analysis_error":
      // The quote could not be located; any highlight would point at the wrong text.
      return null;
  }
}

/** Highlight marks for one transcript, built purely from fact offsets. */
export function marksFor(findings: readonly Finding[], transcript: TranscriptId): Mark[] {
  const marks: Mark[] = [];
  for (const f of findings) {
    const tone = toneFor(f.result.category);
    if (tone === null) continue;
    for (const fact of factsOf(f.result)) {
      if (fact.source.transcript !== transcript) continue;
      marks.push({ id: f.key, start: fact.source.start, end: fact.source.end, tone });
    }
  }
  return marks;
}

export function pluralize(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
