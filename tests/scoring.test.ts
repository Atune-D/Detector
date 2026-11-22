import { describe, expect, it } from "vitest";
import { POLICY, scoreCompareResult, type CompareResult, type Fact } from "../src/engine";
import * as S from "./fixtures/sec61";

const cr = (result: CompareResult["result"], ruleId: string, extra: Partial<CompareResult> = {}): CompareResult => ({
  result,
  ruleId,
  evidenceRefs: [],
  missingConditions: [],
  assumptions: [],
  ...extra,
});

const { a, b } = S.homeAllEveningVsWentOut;
const withMarker = (f: Fact, text: string, modifies: "action" | "time" | "others_action", start = 100): Fact => ({
  ...f,
  uncertaintyMarkers: [...f.uncertaintyMarkers, { text, modifies, span: { start, end: start + text.length } }],
});

describe("scoring (§4)", () => {
  it("conflict from negation / event time / state -> direct 85", () => {
    for (const rule of ["R_NEGATION", "R_EVENT_TIME", "R_STATE"]) {
      expect(scoreCompareResult(cr("conflict", rule), [a, b])).toMatchObject({ category: "direct", score: 85 });
    }
  });

  it("conflict from a template -> inferential 75", () => {
    expect(scoreCompareResult(cr("conflict", "R_TEMPLATE_ALONE_VS_COPRESENT"), [a, b])).toMatchObject({ category: "inferential", score: 75 });
  });

  it("uncertainty on the core action deducts 10, at most once; 65 is reachable", () => {
    const fa = withMarker(a, "I believe", "action", 3);
    const fb = withMarker(withMarker(b, "I think", "action", 7), "probably", "action", 20);
    const s = scoreCompareResult(cr("conflict", "R_TEMPLATE_ALONE_VS_COPRESENT"), [fa, fb]);
    expect(s.score).toBe(65);
    expect(s.record.baseScore).toBe(75);
    expect(s.record.deduction).toEqual({ amount: 10, factId: "a-home", transcript: "A", markerText: "I believe", start: 3, end: 12 });
    expect(scoreCompareResult(cr("conflict", "R_STATE"), [a, fb]).score).toBe(75);
  });

  it("time markers and other-person markers do not deduct", () => {
    const fb = withMarker(withMarker(b, "around", "time"), "might", "others_action");
    const s = scoreCompareResult(cr("conflict", "R_STATE"), [a, fb]);
    expect(s.score).toBe(85);
    expect(s.record.deduction).toBeNull();
  });

  it("compatible -> false positive, unknown -> needs review; both null, never 0", () => {
    const c = scoreCompareResult(cr("compatible", "R_STATE"), [a, b]);
    expect(c).toEqual({
      category: "false_positive",
      score: null,
      record: { policyVersion: POLICY.version, ruleId: "R_STATE", baseScore: null, finalScore: null, deduction: null, missingConditions: [], assumptions: [] },
    });
    const u = scoreCompareResult(cr("unknown", "R_NEGATION", { missingConditions: ["polarity_undetermined:x"] }), [withMarker(a, "I think", "action")]);
    expect(u.category).toBe("needs_review");
    expect(u.score).toBeNull();
    expect(u.record.finalScore).toBeNull();
    expect(u.record.deduction).toBeNull();
    expect(u.record.missingConditions).toEqual(["polarity_undetermined:x"]);
  });

  it("record carries policy version, rule id, missing conditions and assumptions", () => {
    const s = scoreCompareResult(cr("conflict", "R_STATE", { assumptions: ["vocab_period:evening"] }), [a, b]);
    expect(s.record).toEqual({
      policyVersion: "policy-v1",
      ruleId: "R_STATE",
      baseScore: 85,
      finalScore: 85,
      deduction: null,
      missingConditions: [],
      assumptions: ["vocab_period:evening"],
    });
  });
});
