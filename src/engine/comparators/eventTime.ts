/**
 * §3.2 Event-time comparator (R_EVENT_TIME).
 */
import { POLICY, type Policy } from "../config";
import { makeResult, normalizeQuestion, resolveFactTime, type Resolved } from "../common";
import { possiblyDisjoint, timeAssumptions } from "../time";
import { ASSUMPTION, MISSING, RULE_IDS } from "../rules";
import { PREDICATE_KINDS, type CompareResult, type Fact } from "../types";

const RULE = RULE_IDS.eventTime;

export type SameEvent = "same_explicit" | "same_presumed" | "different" | "undetermined";

function instantDate(f: Fact): string | null {
  return f.time.kind === "instant" ? f.time.date : null;
}

/**
 * Same-event determination. Only two grounds make two facts the same occurrence:
 * 1. the testimony explicitly points at the same occurrence (definite "that arrival",
 *    or matching ordinals "the first time") on the same date;
 * 2. presumption: same question asked, same date referenced (recorded as an assumption).
 * Same type + same date alone is never enough.
 */
export function sameEvent(a: Fact, b: Fact): SameEvent {
  const da = instantDate(a);
  const db = instantDate(b);
  const sameDate = da !== null && db !== null && da === db;
  if (da !== null && db !== null && da !== db) return "different";

  const oa = a.occurrence;
  const ob = b.occurrence;
  if (oa?.kind === "ordinal" && ob?.kind === "ordinal") {
    if (oa.n !== ob.n) return "different";
    if (sameDate) return "same_explicit";
  }
  if (oa?.kind === "definite" && ob?.kind === "definite" && sameDate) return "same_explicit";

  if (sameDate && normalizeQuestion(a.source.question) === normalizeQuestion(b.source.question)) {
    return "same_presumed";
  }
  return "undetermined";
}

export function compareEventTime(a: Fact, b: Fact, policy: Policy = POLICY): CompareResult {
  const facts = [a, b];
  const unknown = (missing: string[]) => makeResult("unknown", RULE, facts, missing);

  // Comparability re-check.
  if (a.person !== b.person) return unknown([MISSING.personMismatch]);
  if (a.action !== b.action) return unknown([`${MISSING.eventTypeMismatch}:${a.action}/${b.action}`]);
  if (PREDICATE_KINDS[a.action] !== "event") return unknown([`${MISSING.notAnEvent}:${a.action}`]);
  const notAff = facts.filter((f) => f.polarity !== "affirmative");
  if (notAff.length > 0) return unknown(notAff.map((f) => `${MISSING.notAffirmative}:${f.id}`));

  const same = sameEvent(a, b);
  if (same === "different") return makeResult("compatible", RULE, facts);

  const missing: string[] = [];
  if (same === "undetermined") missing.push(MISSING.sameEventUndetermined);
  const times: (Resolved | null)[] = [];
  for (const f of facts) {
    if (f.time.kind !== "instant" && f.time.kind !== "unanchored") {
      missing.push(`${MISSING.timeUnparseable}:${f.id}`);
      times.push(null);
    } else {
      times.push(resolveFactTime(f, policy, missing));
    }
  }
  const [ta, tb] = times;
  if (missing.length > 0 || !ta || !tb) return unknown(missing);

  const assumptions = [
    ...(same === "same_presumed" ? [ASSUMPTION.sameEventBySameQuestion] : []),
    ...timeAssumptions(a, ta),
    ...timeAssumptions(b, tb),
  ];
  return makeResult(possiblyDisjoint(ta, tb) ? "conflict" : "compatible", RULE, facts, [], assumptions);
}
