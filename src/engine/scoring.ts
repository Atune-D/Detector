/**
 * §4 scoring: a pure function of the compare result and the facts' uncertainty markers.
 * Scores are versioned parameters, not probabilities. Unscored results carry null, never 0.
 */
import { POLICY, type Policy } from "./config";
import type { Category, CompareResult, Deduction, Fact, Scored } from "./types";

export function isInferenceRule(ruleId: string): boolean {
  return ruleId.startsWith("R_TEMPLATE_");
}

/**
 * Deduction applies once per candidate when a fact the conflict rests on carries an
 * uncertainty marker on its core action/state ("I think I went out").
 * Not deducted:
 * - time markers: they live in TimeSpec and are consumed by the tolerance widening;
 *   UncertaintyMarker with modifies="time" is likewise treated as consumed;
 * - markers that made a condition unknown (e.g. "might have seen me" on another
 *   person's action): such a candidate is never a conflict, so never scored.
 * Order is deterministic: facts in the given order, markers in array order.
 */
export function findDeduction(facts: readonly Fact[], policy: Policy = POLICY): Deduction | null {
  for (const f of facts) {
    for (const m of f.uncertaintyMarkers) {
      if (m.modifies === "action") {
        return {
          amount: policy.scoring.uncertaintyDeduction,
          factId: f.id,
          transcript: f.source.transcript,
          markerText: m.text,
          start: m.span.start,
          end: m.span.end,
        };
      }
    }
  }
  return null;
}

export function scoreCompareResult(compare: CompareResult, facts: readonly Fact[], policy: Policy = POLICY): Scored {
  const base = {
    policyVersion: policy.version,
    ruleId: compare.ruleId,
    missingConditions: [...compare.missingConditions],
    assumptions: [...compare.assumptions],
  };
  if (compare.result !== "conflict") {
    const category: Category = compare.result === "compatible" ? "false_positive" : "needs_review";
    return { category, score: null, record: { ...base, baseScore: null, finalScore: null, deduction: null } };
  }
  const inferential = isInferenceRule(compare.ruleId);
  const baseScore = inferential ? policy.scoring.inferential : policy.scoring.direct;
  const deduction = findDeduction(facts, policy);
  const finalScore = baseScore - (deduction ? deduction.amount : 0);
  return {
    category: inferential ? "inferential" : "direct",
    score: finalScore,
    record: { ...base, baseScore, finalScore, deduction },
  };
}
