/**
 * Fixed code -> text maps. Every explanation shown in the UI comes from here,
 * keyed by engine rule ids and MISSING / ASSUMPTION codes. Nothing written by
 * the LLM is ever rendered as an explanation. Unknown codes fall back to the
 * raw code so nothing is silently hidden.
 */
import { ASSUMPTION, MISSING, RULE_IDS } from "../engine";
import type { AnalysisError, CandidateResult, Category, CompareResult, TranscriptId, UpstreamFailure } from "../engine";

type MissingCode = (typeof MISSING)[keyof typeof MISSING];
type AssumptionCode = (typeof ASSUMPTION)[keyof typeof ASSUMPTION];
type RuleId = (typeof RULE_IDS)[keyof typeof RULE_IDS];

export const RULE_TEXT: Record<RuleId, string> = {
  R_NEGATION:
    "Negation rule: checks whether one statement denies what the other affirms, for the same person, the same predicate and the same object, at a time the denial covers.",
  R_EVENT_TIME:
    "Event-time rule: checks whether two times given for the same occurrence of an event can both be true once each time is widened by its precision policy.",
  R_STATE:
    "State rule: checks whether two explicitly stated conditions that are registered as mutually exclusive are both claimed for a confirmed overlapping period.",
  R_TEMPLATE_ALONE_VS_COPRESENT:
    "Alone vs. co-present template: one statement says the witness was alone throughout a period and place; the other describes an activity that means another person was actually present there at that time.",
  R_TEMPLATE_NONE:
    "An inference was proposed for this pair, but no inference template is implemented for it, so it cannot be decided automatically.",
};

export const MISSING_TEXT: Record<MissingCode, string> = {
  not_cross_transcript: "The two statements do not come from different transcripts.",
  person_mismatch: "The two statements are not about the same person.",
  predicate_relation_unregistered: "The two statements use different predicates with no registered relation between them.",
  predicate_relation_undecided: "A registered predicate relation exists, but it does not decide this case.",
  negation_form_unsupported:
    "The denial is not a whole-sentence negation (for example \"not all evening\" or \"not sure whether\"); this form is not parsed.",
  polarity_undetermined: "It cannot be determined whether the statement affirms or denies (for example \"I don't think…\").",
  object_relation_unresolved: "It is unknown whether the two statements refer to the same object or place.",
  containment_rule_unregistered:
    "One object contains the other, but no containment rule is registered for this predicate.",
  time_not_anchored: "The time of a statement cannot be placed on the timeline.",
  time_unparseable: "The time of a statement could not be parsed.",
  time_inside_negation_unconfirmed: "It is not confirmed that the affirmed time falls inside the period the denial covers.",
  event_type_mismatch: "The two statements describe different kinds of event.",
  not_an_event: "The statement is not about a point-in-time event.",
  not_affirmative: "A statement is not affirmative, so it cannot be compared here.",
  same_event_undetermined: "It cannot be determined whether both statements refer to the same occurrence of the event.",
  not_a_state: "A statement does not describe a lasting state.",
  state_source_not_explicit:
    "A state was inferred from an activity rather than stated directly, so it cannot be compared as a state.",
  state_relation_unregistered: "This combination of states is not registered as either exclusive or compatible.",
  location_relation_unknown: "It is unknown how the two locations relate to each other.",
  time_overlap_unconfirmed: "The two periods may overlap, but an overlap is not confirmed.",
  template_not_implemented: "No inference template is implemented for this kind of reasoning.",
  alone_claim_not_established: "The statement does not establish that the witness was alone throughout a defined period and place.",
  copresence_not_established: "The activity does not establish that another person was actually present.",
  copresence_time_unconfirmed: "It is not confirmed that the other person was present during the period the witness said they were alone.",
  space_scope_unconfirmed: "It is not confirmed that the other person was present in the place the witness said they were alone.",
};

export const ASSUMPTION_TEXT: Record<AssumptionCode, string> = {
  vocab_period: "A time range was taken from the default vocabulary table, not from the testimony.",
  time_tolerance: "A time range was widened or narrowed by the default precision tolerance.",
  "same_event:same_question_same_date":
    "Both answers were presumed to describe the same occurrence because they answer the same question about the same date.",
};

export const CATEGORY_LABEL: Record<Category, string> = {
  direct: "Direct contradiction",
  inferential: "Inferential contradiction",
  false_positive: "False positive",
  needs_review: "Needs review",
  analysis_error: "Analysis error",
};

/** Status label shown instead of a score for unscored results. Never a number. */
export const STATUS_LABEL: Record<Category, string> = {
  direct: "Unscored",
  inferential: "Unscored",
  false_positive: "Dismissed",
  needs_review: "Needs review",
  analysis_error: "Not analysed",
};

export const OUTCOME_TEXT: Record<CompareResult["result"], string> = {
  conflict: "The rule found a conflict.",
  compatible: "The rule found the statements compatible.",
  unknown: "The rule could not reach a conclusion.",
};

export const FAILURE_TEXT: Record<UpstreamFailure, string> = {
  upstream_timeout: "The fact-extraction service did not respond in time.",
  upstream_missing: "The fact-extraction service returned no usable response.",
  malformed: "The fact-extraction response did not have the expected structure.",
  truncated: "The fact-extraction response was cut off before it was complete.",
};

export const ERROR_TEXT: Record<AnalysisError["code"], string> = {
  quote_invalid: "A quoted passage was not found at its stated position in the transcript, so this pair was not analysed.",
};

// ---------------------------------------------------------------------------

export interface Explanation {
  /** Human text, or the raw code when the code is unknown. */
  text: string;
  /** Human-readable detail from the `code:detail` form, if any. */
  detail: string | null;
  known: boolean;
  /** The original code string, for reference. */
  raw: string;
}

/** Fact ids that may appear as a `:detail`, mapped to their transcript. */
export type FactContext = ReadonlyMap<string, TranscriptId>;

function has<K extends string>(map: Record<K, string>, key: string): key is K {
  return Object.prototype.hasOwnProperty.call(map, key);
}

function detailLabel(detail: string, ctx: FactContext): string {
  const t = ctx.get(detail);
  return t ? `statement in Transcript ${t}` : detail;
}

/**
 * Look up a code in a map, accepting both "code" and "code:detail". A full-string
 * match wins first, because some codes contain a colon themselves
 * ("same_event:same_question_same_date").
 */
function explain<K extends string>(map: Record<K, string>, raw: string, ctx: FactContext): Explanation {
  if (has(map, raw)) return { text: map[raw], detail: null, known: true, raw };
  const i = raw.indexOf(":");
  if (i > 0) {
    const code = raw.slice(0, i);
    const detail = raw.slice(i + 1);
    if (has(map, code)) {
      return { text: map[code], detail: detail.length > 0 ? detailLabel(detail, ctx) : null, known: true, raw };
    }
  }
  return { text: raw, detail: null, known: false, raw };
}

export function explainMissing(raw: string, ctx: FactContext = new Map()): Explanation {
  return explain(MISSING_TEXT, raw, ctx);
}

export function explainAssumption(raw: string, ctx: FactContext = new Map()): Explanation {
  return explain(ASSUMPTION_TEXT, raw, ctx);
}

export function ruleText(ruleId: string): string {
  return has(RULE_TEXT, ruleId) ? RULE_TEXT[ruleId] : ruleId;
}

export function failureText(reason: string): string {
  return has(FAILURE_TEXT, reason) ? FAILURE_TEXT[reason] : reason;
}

export function errorText(code: string): string {
  return has(ERROR_TEXT, code) ? ERROR_TEXT[code] : code;
}

/** Map of the candidate's own fact ids to their transcript, for resolving `code:<factId>`. */
export function factContext(r: CandidateResult): FactContext {
  return new Map<string, TranscriptId>([
    [r.candidate.a.id, r.candidate.a.source.transcript],
    [r.candidate.b.id, r.candidate.b.source.transcript],
  ]);
}
