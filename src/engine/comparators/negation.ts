/**
 * §3.1 Negation comparator (R_NEGATION).
 */
import { POLICY, type Policy } from "../config";
import { entityRelation, makeResult, resolveFactTime, type Resolved } from "../common";
import { confirmedOverlap, possiblyDisjoint, timeAssumptions } from "../time";
import { CONTAINMENT_RULE_PREDICATES, MISSING, RULE_IDS, findPredicateRelation } from "../rules";
import type { CompareResult, Fact } from "../types";

const RULE = RULE_IDS.negation;

export function compareNegation(a: Fact, b: Fact, policy: Policy = POLICY): CompareResult {
  const facts = [a, b];
  const unknown = (missing: string[]) => makeResult("unknown", RULE, facts, missing);

  // --- Self-check 1: same person.
  if (a.person !== b.person) return unknown([MISSING.personMismatch]);

  // --- Self-check 2: same predicate, or a registered predicate relation.
  const samePredicate = a.action === b.action;
  const relation = samePredicate ? null : findPredicateRelation(a.action, b.action);
  if (!samePredicate && relation === null) {
    return unknown([`${MISSING.predicateRelationUnregistered}:${a.action}/${b.action}`]);
  }

  // --- Self-check 3: every negation is whole-sentence negation.
  const formMissing: string[] = [];
  for (const f of facts) {
    if (f.polarity === "negative" && f.negationForm !== "whole") {
      formMissing.push(`${MISSING.negationFormUnsupported}:${f.id}`);
    }
  }
  if (formMissing.length > 0) return unknown(formMissing);

  // --- Table.
  const undetermined = facts.filter((f) => f.polarity === "undetermined");
  if (undetermined.length > 0) return unknown(undetermined.map((f) => `${MISSING.polarityUndetermined}:${f.id}`));

  if (a.polarity === b.polarity) return makeResult("compatible", RULE, facts);

  const neg = a.polarity === "negative" ? a : b;
  const aff = neg === a ? b : a;

  const timeMissing: string[] = [];
  const tNeg = resolveFactTime(neg, policy, timeMissing);
  const tAff = resolveFactTime(aff, policy, timeMissing);
  const bothTimes = (): [Resolved, Resolved] | null => (tNeg && tAff ? [tNeg, tAff] : null);
  const timeAssume = (): string[] => [
    ...(tNeg ? timeAssumptions(neg, tNeg) : []),
    ...(tAff ? timeAssumptions(aff, tAff) : []),
  ];

  // Opposite polarity, but the affirmed time is clearly outside the negated period.
  const times = bothTimes();
  if (times && possiblyDisjoint(times[0], times[1])) {
    return makeResult("compatible", RULE, facts, [], timeAssume());
  }

  // Object relation, interpreted through the predicate's registered rules.
  const rel = entityRelation(aff.object, neg.object); // x = affirmed, y = negated
  let objectOutcome: "conflict_possible" | "compatible" | { missing: string };

  if (relation !== null) {
    // passed_through (affirmed) vs been_to (negated): passing an area does not mean
    // having been to a specific place inside it.
    if (neg.action === relation.negated && aff.action === relation.affirmed && rel === "y_within_x") {
      objectOutcome = "compatible";
    } else {
      objectOutcome = { missing: `${MISSING.predicateRelationUndecided}:${relation.id}` };
    }
  } else if (rel === "same") {
    objectOutcome = "conflict_possible";
  } else if (rel === "unresolved") {
    objectOutcome = { missing: MISSING.objectRelationUnresolved };
  } else if (!CONTAINMENT_RULE_PREDICATES.includes(neg.action)) {
    objectOutcome = { missing: `${MISSING.containmentRuleUnregistered}:${neg.action}` };
  } else if (rel === "x_within_y") {
    // Affirmed an inner place of the negated one: entering the inner space implies entering the outer.
    objectOutcome = "conflict_possible";
  } else {
    // Affirmed the larger area, negated a specific place inside it: no conflict follows.
    objectOutcome = "compatible";
  }

  if (objectOutcome === "compatible") return makeResult("compatible", RULE, facts);
  if (objectOutcome !== "conflict_possible") return unknown([objectOutcome.missing, ...timeMissing]);

  if (!times) return unknown(timeMissing);
  if (confirmedOverlap(times[0], times[1])) {
    return makeResult("conflict", RULE, facts, [], timeAssume());
  }
  return unknown([MISSING.timeInsideNegationUnconfirmed]);
}
