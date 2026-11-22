/**
 * Typed mock AnalyzeResponse for UI helper tests, built directly from the engine
 * types. Offsets are computed once here from the fixture text; the UI itself
 * never searches for quotes.
 */
import type { AnalyzeResponse } from "../../src/contract";
import type { CandidateResult, Category, CompareKind, CompareResult, Deduction, Fact, TranscriptId } from "../../src/engine";

export const TEXT_A =
  "Q: Where were you on the evening of November 3rd?\nA: I was at home all evening.\n\n" +
  "Q: What time did you go to sleep?\nA: Around 10, maybe 10:30.\n\n" +
  "Q: Was anyone with you that evening?\nA: No, I was alone.\n";

export const TEXT_B =
  "Q: Did you leave your home at any point on the evening of November 3rd?\nA: I think I went out briefly to get some groceries, maybe around 7:30.\n\n" +
  "Q: What time did you go to sleep?\nA: Midnight maybe.\n\n" +
  "Q: Did anyone see you that evening?\nA: Tom might have seen me. We waved or something.\n";

const TEXTS: Record<TranscriptId, string> = { A: TEXT_A, B: TEXT_B };

function offsetOf(t: TranscriptId, quote: string): number {
  const i = TEXTS[t].indexOf(quote);
  if (i < 0) throw new Error(`fixture quote not found: ${quote}`);
  return i;
}

export function mockFact(id: string, t: TranscriptId, quote: string, question = "Q?"): Fact {
  const start = offsetOf(t, quote);
  return {
    id,
    person: "witness",
    action: "location.home",
    time: { kind: "unanchored", original: "" },
    polarity: "affirmative",
    negationForm: null,
    stateSource: { kind: "explicit" },
    uncertaintyMarkers: [],
    source: { transcript: t, qaId: `${t}-${id}`, question, quote, start, end: start + quote.length },
  };
}

interface ResultInput {
  a: Fact;
  b: Fact;
  kind: CompareKind;
  category: Category;
  score: number | null;
  ruleId: string;
  missing?: string[];
  assumptions?: string[];
  deduction?: Deduction | null;
}

export function mockResult(x: ResultInput): CandidateResult {
  const compareResult: CompareResult["result"] =
    x.category === "direct" || x.category === "inferential" ? "conflict" : x.category === "false_positive" ? "compatible" : "unknown";
  const candidate = { id: `${x.kind}||${x.a.id}|${x.b.id}`, a: x.a, b: x.b, kind: x.kind, origins: ["program" as const], reasons: [] };
  if (x.category === "analysis_error") {
    return {
      candidate,
      category: "analysis_error",
      score: null,
      compare: null,
      record: null,
      errors: [{ code: "quote_invalid", factId: x.a.id, detail: "text at [0,5) does not match quote" }],
    };
  }
  const compare: CompareResult = {
    result: compareResult,
    ruleId: x.ruleId,
    evidenceRefs: [],
    missingConditions: x.missing ?? [],
    assumptions: x.assumptions ?? [],
  };
  const base = compareResult === "conflict" ? (x.category === "direct" ? 85 : 75) : null;
  return {
    candidate,
    category: x.category,
    score: x.score,
    compare,
    record: {
      policyVersion: "policy-v1",
      ruleId: x.ruleId,
      baseScore: base,
      finalScore: x.score,
      deduction: x.deduction ?? null,
      missingConditions: x.missing ?? [],
      assumptions: x.assumptions ?? [],
    },
    errors: [],
  };
}

const aHome = mockFact("A-home", "A", "I was at home all evening.");
const aSleep = mockFact("A-sleep", "A", "Around 10, maybe 10:30.");
const aAlone = mockFact("A-alone", "A", "I was alone");
const bOut = mockFact("B-out", "B", "I think I went out briefly to get some groceries, maybe around 7:30.");
const bSleep = mockFact("B-sleep", "B", "Midnight maybe.");
const bWaved = mockFact("B-waved", "B", "Tom might have seen me. We waved or something.");
const bGroceries = mockFact("B-groceries", "B", "get some groceries");

const iThink = offsetOf("B", "I think");

/** Engine order deliberately differs from display order. */
export const mockResults: CandidateResult[] = [
  mockResult({ a: aAlone, b: bWaved, kind: "template", category: "needs_review", score: null, ruleId: "R_TEMPLATE_ALONE_VS_COPRESENT", missing: ["copresence_not_established:activity.waved"] }),
  mockResult({
    a: aHome,
    b: bOut,
    kind: "state",
    category: "direct",
    score: 75,
    ruleId: "R_STATE",
    assumptions: ["vocab_period:evening", "time_tolerance:B-out"],
    deduction: { amount: 10, factId: "B-out", transcript: "B", markerText: "I think", start: iThink, end: iThink + 7 },
  }),
  mockResult({ a: aHome, b: bGroceries, kind: "state", category: "false_positive", score: null, ruleId: "R_STATE" }),
  mockResult({ a: aSleep, b: bSleep, kind: "event_time", category: "direct", score: 85, ruleId: "R_EVENT_TIME", assumptions: ["same_event:same_question_same_date"] }),
  mockResult({ a: aAlone, b: bOut, kind: "template", category: "analysis_error", score: null, ruleId: "R_TEMPLATE_NONE" }),
];

export const mockResponse: AnalyzeResponse = {
  mode: "replay",
  run: { status: "completed_partial", results: mockResults, errorCount: 1 },
  transcripts: { A: TEXT_A, B: TEXT_B },
  facts: { A: [aHome, aSleep, aAlone], B: [bOut, bSleep, bWaved, bGroceries] },
};
