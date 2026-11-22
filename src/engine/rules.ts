/**
 * Rule tables written in code, not decided by the LLM (spec §3.1, §3.3, §3.4).
 * Only concrete, finite entries — no whole-dimension shortcuts. Anything not
 * listed here is "unregistered" and yields `unknown`.
 */
import type { Predicate } from "./types";

export const RULE_IDS = {
  negation: "R_NEGATION",
  eventTime: "R_EVENT_TIME",
  state: "R_STATE",
  aloneVsCopresent: "R_TEMPLATE_ALONE_VS_COPRESENT",
  /** Inference reason proposed but no template implemented -> needs review. */
  noTemplate: "R_TEMPLATE_NONE",
} as const;

// ---------------------------------------------------------------------------
// §3.1 negation: containment rule + predicate relation rule (V1 registers exactly these two)
// ---------------------------------------------------------------------------

/**
 * Entering-type predicates carry the containment rule: entering an inner space
 * implies entering its enclosing building/area; having been to the larger area
 * does not imply entering a specific place inside it.
 */
export const CONTAINMENT_RULE_PREDICATES: readonly Predicate[] = ["been_to", "entered"];

/**
 * Registered relation between two different predicates.
 * passed_through vs been_to: passing through an area does not imply having been
 * to a specific place inside it.
 */
export interface PredicateRelation {
  negated: Predicate;
  affirmed: Predicate;
  id: "passed_through_vs_been_to";
}

export const PREDICATE_RELATIONS: readonly PredicateRelation[] = [
  { negated: "been_to", affirmed: "passed_through", id: "passed_through_vs_been_to" },
];

/** Registered relation between two predicates, in either polarity direction. */
export function findPredicateRelation(p: Predicate, q: Predicate): PredicateRelation | null {
  for (const r of PREDICATE_RELATIONS) {
    if ((r.negated === p && r.affirmed === q) || (r.negated === q && r.affirmed === p)) return r;
  }
  return null;
}

// ---------------------------------------------------------------------------
// §3.3 state relation table — explicit entries only
// ---------------------------------------------------------------------------

export type StateRelation = "exclusive" | "coexist";

export interface StateRelationEntry {
  x: Predicate;
  y: Predicate;
  relation: StateRelation;
  note: string;
}

export const STATE_RELATIONS: readonly StateRelationEntry[] = [
  { x: "location.home", y: "location.out", relation: "exclusive", note: "在家 vs 外出" },
  { x: "sleep_state.asleep", y: "sleep_state.awake", relation: "exclusive", note: "睡眠中 vs 清醒" },
  { x: "company.alone", y: "company.accompanied", relation: "exclusive", note: "独处 vs 有人在场（两边都是显式状态）" },
  { x: "location.home", y: "activity.watching_tv", relation: "coexist", note: "在家 + 看电视" },
  { x: "activity.ordered_food", y: "activity.bought_groceries", relation: "coexist", note: "订披萨 + 买菜" },
];

export function lookupStateRelation(p: Predicate, q: Predicate): StateRelationEntry | null {
  for (const e of STATE_RELATIONS) {
    if ((e.x === p && e.y === q) || (e.x === q && e.y === p)) return e;
  }
  return null;
}

// ---------------------------------------------------------------------------
// §3.4 activities that imply the other person was ACTUALLY co-present
// ---------------------------------------------------------------------------

/** Face-to-face conversation satisfies; phone calls, waving, "might have seen me" do not. */
export const COPRESENCE_ACTIVITIES: readonly Predicate[] = ["activity.conversation_face_to_face"];

// ---------------------------------------------------------------------------
// Missing-condition codes (stable; UI may map them to text). Format "code" or "code:detail".
// ---------------------------------------------------------------------------

export const MISSING = {
  notCrossTranscript: "not_cross_transcript",
  personMismatch: "person_mismatch",
  predicateRelationUnregistered: "predicate_relation_unregistered",
  predicateRelationUndecided: "predicate_relation_undecided",
  negationFormUnsupported: "negation_form_unsupported",
  polarityUndetermined: "polarity_undetermined",
  objectRelationUnresolved: "object_relation_unresolved",
  containmentRuleUnregistered: "containment_rule_unregistered",
  timeNotAnchored: "time_not_anchored",
  timeUnparseable: "time_unparseable",
  timeInsideNegationUnconfirmed: "time_inside_negation_unconfirmed",
  eventTypeMismatch: "event_type_mismatch",
  notAnEvent: "not_an_event",
  notAffirmative: "not_affirmative",
  sameEventUndetermined: "same_event_undetermined",
  notAState: "not_a_state",
  stateSourceNotExplicit: "state_source_not_explicit",
  stateRelationUnregistered: "state_relation_unregistered",
  locationRelationUnknown: "location_relation_unknown",
  timeOverlapUnconfirmed: "time_overlap_unconfirmed",
  templateNotImplemented: "template_not_implemented",
  aloneClaimNotEstablished: "alone_claim_not_established",
  copresenceNotEstablished: "copresence_not_established",
  copresenceTimeUnconfirmed: "copresence_time_unconfirmed",
  spaceScopeUnconfirmed: "space_scope_unconfirmed",
} as const;

export const ASSUMPTION = {
  /** "vocab_period:<name>" — range came from the vocabulary table. */
  vocabPeriod: "vocab_period",
  /** "time_tolerance:<factId>" — that fact's range was widened/shrunk by the tolerance policy. */
  timeTolerance: "time_tolerance",
  /** Same event presumed from "same question + same date". */
  sameEventBySameQuestion: "same_event:same_question_same_date",
} as const;
