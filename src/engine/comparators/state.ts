/**
 * §3.3 State comparator (R_STATE). Accepts only facts whose state source is explicit.
 */
import { POLICY, type Policy } from "../config";
import { makeResult, resolveFactTime } from "../common";
import { confirmedOverlap, possiblyDisjoint, timeAssumptions } from "../time";
import { MISSING, RULE_IDS, lookupStateRelation } from "../rules";
import { PREDICATE_KINDS, type CompareResult, type Fact } from "../types";

const RULE = RULE_IDS.state;

function isLocation(f: Fact): boolean {
  return f.action.startsWith("location.");
}

function locationLabel(f: Fact): string {
  return f.location ? `${f.action}(${f.location.id})` : f.action;
}

export function compareState(a: Fact, b: Fact, policy: Policy = POLICY): CompareResult {
  const facts = [a, b];
  const unknown = (missing: string[]) => makeResult("unknown", RULE, facts, missing);

  // Comparability re-check.
  if (a.person !== b.person) return unknown([MISSING.personMismatch]);
  const pre: string[] = [];
  for (const f of facts) {
    const kind = PREDICATE_KINDS[f.action];
    if (kind !== "state" && kind !== "activity") pre.push(`${MISSING.notAState}:${f.id}`);
    if (f.stateSource.kind !== "explicit") pre.push(`${MISSING.stateSourceNotExplicit}:${f.id}`);
    if (f.polarity !== "affirmative") pre.push(`${MISSING.notAffirmative}:${f.id}`);
  }
  if (pre.length > 0) return unknown(pre);

  const entry = lookupStateRelation(a.action, b.action);

  // Registered as able to coexist: no time needed.
  if (entry?.relation === "coexist") return makeResult("compatible", RULE, facts);

  const missing: string[] = [];
  const ta = resolveFactTime(a, policy, missing);
  const tb = resolveFactTime(b, policy, missing);
  const assume = (): string[] => [...(ta ? timeAssumptions(a, ta) : []), ...(tb ? timeAssumptions(b, tb) : [])];

  if (ta && tb && possiblyDisjoint(ta, tb)) return makeResult("compatible", RULE, facts, [], assume());

  if (entry === null) {
    missing.push(
      isLocation(a) && isLocation(b)
        ? `${MISSING.locationRelationUnknown}:${locationLabel(a)}/${locationLabel(b)}`
        : `${MISSING.stateRelationUnregistered}:${a.action}/${b.action}`,
    );
  }
  if (ta && tb && !confirmedOverlap(ta, tb)) missing.push(MISSING.timeOverlapUnconfirmed);

  if (entry?.relation === "exclusive" && missing.length === 0) {
    return makeResult("conflict", RULE, facts, [], assume());
  }
  return unknown(missing);
}
