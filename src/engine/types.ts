/**
 * Core data contract of the contradiction engine (spec docs/plan.md §1–§5).
 *
 * Everything here is plain data. The engine never reads a confidence value
 * from the LLM: there is deliberately no field for one.
 */

// ---------------------------------------------------------------------------
// Controlled vocabulary (spec §1 "动作或状态 ... 归入受控词表")
// ---------------------------------------------------------------------------

/**
 * Predicate kinds:
 * - state:    a lasting condition (location.home, sleep_state.asleep, company.alone)
 * - activity: something done over a stretch of time that can be compared as a state
 *             when it is explicitly stated (ordering food, watching TV)
 * - event:    a point occurrence that may happen several times a night (arrival,
 *             going out, falling asleep) -> event-time comparison
 * - relation: a relation to an object/person (been_to, knows_of, bought) -> negation
 */
export type PredicateKind = "state" | "activity" | "event" | "relation";

export const PREDICATE_KINDS = {
  // states — dimension.value
  "location.home": "state",
  /** Away from home; where exactly may be given in `location` (e.g. another city). */
  "location.out": "state",
  /** At a specific place given in `location`, whose relation to home is not implied. */
  "location.place": "state",
  "sleep_state.asleep": "state",
  "sleep_state.awake": "state",
  "company.alone": "state",
  "company.accompanied": "state",
  // activities
  "activity.watching_tv": "activity",
  "activity.ordered_food": "activity",
  "activity.bought_groceries": "activity",
  "activity.driving": "activity",
  "activity.phone_call": "activity",
  "activity.conversation_face_to_face": "activity",
  "activity.waved": "activity",
  // events
  arrival: "event",
  went_out: "event",
  sleep_onset: "event",
  // relations
  been_to: "relation",
  entered: "relation",
  passed_through: "relation",
  knows: "relation",
  knows_of: "relation",
  met: "relation",
  saw: "relation",
  talked_with: "relation",
  bought: "relation",
} as const satisfies Record<string, PredicateKind>;

export type Predicate = keyof typeof PREDICATE_KINDS;

// ---------------------------------------------------------------------------
// Entities (object / location with granularity)
// ---------------------------------------------------------------------------

export type Granularity =
  | "person"
  | "room"
  | "building"
  | "unit"
  | "site"
  | "area"
  | "city"
  | "region"
  | "other";

export interface Entity {
  /** Normalised id; two facts refer to the same entity iff ids are equal. */
  id: string;
  label: string;
  granularity: Granularity;
  /**
   * Ids of entities that contain this one, nearest first
   * (office -> ["warehouse", "hargrove_area"]). Containment is only known
   * when listed here; absence means "relation unknown", not "disjoint".
   */
  partOf?: readonly string[];
}

// ---------------------------------------------------------------------------
// Time (spec §3.2, §3.3)
// ---------------------------------------------------------------------------

/** exact = exactly/sharp; approx = around/about/roughly; hedge = maybe/I think/probably */
export type TimeMarkerClass = "exact" | "approx" | "hedge";

export interface Span {
  /** UTF-16 code-unit offsets into the transcript, half-open [start, end). */
  start: number;
  end: number;
}

export interface TimeMarker {
  text: string;
  class: TimeMarkerClass;
  span?: Span;
}

/** Calendar date "YYYY-MM-DD" plus minutes from that date's 00:00 (may exceed 1440 to spill into the next day; 1440 = midnight at the end of that date). */
export interface TimePoint {
  date: string;
  minute: number;
}

export interface IntervalBound extends TimePoint {
  markers: readonly TimeMarker[];
}

export type TimeSpec =
  /** A moment. `from`/`to` are minutes on `date`; a parsed range like "10, maybe 10:30" has from=1320,to=1350. */
  | { kind: "instant"; original: string; date: string; from: number; to: number; markers: readonly TimeMarker[] }
  /** A duration given by two bounds. */
  | { kind: "interval"; original: string; start: IntervalBound; end: IntervalBound }
  /** A vocabulary period ("evening") resolved from the policy table — always policy-derived. */
  | { kind: "period"; original: string; date: string; period: string }
  /** The claim covers all time ("never", "always"). */
  | { kind: "all_time"; original: string }
  /** Happened at some unspecified time ("I've been there"). */
  | { kind: "some_time"; original: string }
  /** Time is referred to but could not be anchored to the timeline. */
  | { kind: "unanchored"; original: string };

// ---------------------------------------------------------------------------
// Fact (spec §1)
// ---------------------------------------------------------------------------

export type Polarity = "affirmative" | "negative" | "undetermined";

/**
 * What a negation negates:
 * - whole:     whole-sentence negation ("整晚都不在家", "never went")
 * - universal: negation of "all" ("没有整晚在家", "not every time")
 * - certainty: negation of certainty ("不确定是否在家")
 * Only "whole" is parsed in V1; the others make the negation comparator return unknown.
 */
export type NegationForm = "whole" | "universal" | "certainty";

export interface Activity {
  predicate: Predicate;
  /** Other person involved, if any (entity id). */
  counterpart?: string;
  /** The original activity wording, retained verbatim. */
  text: string;
}

export type StateSource =
  | { kind: "explicit" }
  /** State inferred from an activity; the activity is retained, never rewritten as a state. */
  | { kind: "derived"; activity: Activity };

export type UncertaintyTarget = "action" | "time" | "others_action";

export interface UncertaintyMarker {
  text: string;
  /** What the marker modifies: the core action/state, the time, or another person's behaviour. */
  modifies: UncertaintyTarget;
  span: Span;
}

export type TranscriptId = "A" | "B";

export interface FactSource {
  transcript: TranscriptId;
  /** Q/A pair id within the transcript. */
  qaId: string;
  /** The question text that was asked (used for the "same question" same-event ground). */
  question: string;
  /** Verbatim quote of the answer text supporting this fact. */
  quote: string;
  /** UTF-16 [start, end) offsets of `quote` in the transcript. */
  start: number;
  end: number;
}

export interface Fact {
  id: string;
  /** Normalised person id the fact is about. */
  person: string;
  action: Predicate;
  object?: Entity;
  location?: Entity;
  time: TimeSpec;
  polarity: Polarity;
  /** Required when polarity is "negative"; null otherwise. */
  negationForm: NegationForm | null;
  stateSource: StateSource;
  uncertaintyMarkers: readonly UncertaintyMarker[];
  /**
   * Explicit occurrence reference made by the testimony itself:
   * - definite: "that arrival", "when you arrived" (the single occurrence on that date)
   * - ordinal:  "the first time I fell asleep", "the second time I went out"
   */
  occurrence?: { kind: "definite" } | { kind: "ordinal"; n: number };
  source: FactSource;
}

// ---------------------------------------------------------------------------
// Candidate (spec §2)
// ---------------------------------------------------------------------------

export type CompareKind = "negation" | "event_time" | "state" | "template";

export type TemplateId = "R_TEMPLATE_ALONE_VS_COPRESENT";

export type CandidateOrigin = "program" | "nomination";

export interface Candidate {
  /** Deterministic id: kind|templateId|factA|factB. */
  id: string;
  /** Fact from transcript A. */
  a: Fact;
  /** Fact from transcript B. */
  b: Fact;
  kind: CompareKind;
  /**
   * For kind "template": the template to run. A nominated inference without an
   * implemented template carries `null` (or an unimplemented id) and is routed
   * straight to needs_review.
   */
  templateId?: string | null;
  origins: readonly CandidateOrigin[];
  /** Nomination reasons (free text from the nominator; never read by comparators). */
  reasons: readonly string[];
}

/** An AI nomination: decides only *whether* to compare, never the outcome. */
export interface Nomination {
  factIdA: string;
  factIdB: string;
  kind: CompareKind;
  templateId?: string | null;
  reason: string;
}

// ---------------------------------------------------------------------------
// Compare result (spec §3, exact shape)
// ---------------------------------------------------------------------------

export interface EvidenceRef {
  factId: string;
  transcript: TranscriptId;
  qaId: string;
  quote: string;
  start: number;
  end: number;
}

export interface CompareResult {
  result: "conflict" | "compatible" | "unknown";
  ruleId: string;
  evidenceRefs: EvidenceRef[];
  /** When result = "unknown": what is missing. */
  missingConditions: string[];
  /** Policy defaults the conclusion relies on (vocabulary / tolerance / same-event presumption). */
  assumptions: string[];
}

// ---------------------------------------------------------------------------
// Scoring (spec §4)
// ---------------------------------------------------------------------------

export type Category = "direct" | "inferential" | "false_positive" | "needs_review" | "analysis_error";

export interface Deduction {
  amount: number;
  factId: string;
  transcript: TranscriptId;
  markerText: string;
  start: number;
  end: number;
}

export interface ScoringRecord {
  /** Version of the policy/config object that produced the numbers. */
  policyVersion: string;
  ruleId: string;
  baseScore: number | null;
  finalScore: number | null;
  deduction: Deduction | null;
  missingConditions: string[];
  assumptions: string[];
}

export interface Scored {
  category: Category;
  /** null when not scored (compatible / unknown / analysis error) — never 0. */
  score: number | null;
  record: ScoringRecord;
}

export interface AnalysisError {
  code: "quote_invalid";
  factId: string;
  detail: string;
}

export interface CandidateResult {
  candidate: Candidate;
  category: Category;
  score: number | null;
  /** null for analysis_error. */
  compare: CompareResult | null;
  /** null for analysis_error. */
  record: ScoringRecord | null;
  errors: AnalysisError[];
}

// ---------------------------------------------------------------------------
// Run-level result (spec §5)
// ---------------------------------------------------------------------------

export type UpstreamFailure = "upstream_timeout" | "upstream_missing" | "malformed" | "truncated";

export type RunResult =
  /** Normal completion, at least one candidate, no analysis errors. */
  | { status: "completed"; results: CandidateResult[] }
  /** Normal completion with zero candidates ("本次分析未发现候选" — not a guarantee of no misses). */
  | { status: "completed_empty"; results: [] }
  /** Completed, but some candidates are analysis errors. */
  | { status: "completed_partial"; results: CandidateResult[]; errorCount: number }
  /** Upstream timeout, missing/malformed/truncated response. */
  | { status: "failed"; reason: UpstreamFailure; detail: string };

export interface Transcripts {
  A: string;
  B: string;
}
