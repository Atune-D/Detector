/**
 * Spec §6.2 — Marcus Webb, March (A) vs September (B), hand-built fixtures on the brief's real wording.
 * Regression only: these results do not prove the policy defaults are right.
 */
import { describe, expect, it } from "vitest";
import { POLICY, analyzeRun, buildCandidates, type CandidateResult } from "../src/engine";
import * as M from "./fixtures/marcusWebb";

function runAll() {
  const { candidates, rejectedNominations } = buildCandidates(M.marchFacts, M.septemberFacts, M.nominations);
  const run = analyzeRun(candidates, M.transcripts);
  return { candidates, rejectedNominations, run };
}

function resultFor(results: CandidateResult[], a: string, b: string): CandidateResult {
  const r = results.find((x) => x.candidate.a.id === a && x.candidate.b.id === b);
  if (!r) throw new Error(`no candidate ${a} / ${b}`);
  return r;
}

describe("§6.2 Marcus Webb sample", () => {
  const { candidates, rejectedNominations, run } = runAll();
  const results = run.status === "completed" ? run.results : [];

  it("builds the seven candidates of the table plus home-vs-parking-lot, and completes without errors", () => {
    expect(rejectedNominations).toEqual([]);
    expect(run.status).toBe("completed");
    expect(candidates.map((c) => [c.a.id, c.b.id, c.kind]).sort()).toEqual(
      [
        ["M1-home", "S1-out", "state"],
        // Real wording: "We waved or something in the parking lot" puts him in the parking lot (§3.3 / §6.1 row).
        ["M1-home", "S4-parking-lot", "state"],
        ["M2-pizza", "S1-groceries", "state"],
        ["M3-sleep", "S3-sleep", "event_time"],
        ["M4-alone", "S4-waved", "template"],
        ["M5-not-been", "S5-passed", "negation"],
        ["M6-not-known", "S6-knew-of", "negation"],
        ["M7-not-met", "S7-met", "negation"],
      ].sort(),
    );
  });

  it('"at home all evening" vs "I think I went out briefly… maybe around 7:30" -> direct 75, relies on policy', () => {
    const r = resultFor(results, "M1-home", "S1-out");
    // The input includes the question and the "evening of November 3rd" anchor.
    expect(r.candidate.a.source.question).toContain("evening of November 3rd");
    expect(r.candidate.a.time).toEqual({ kind: "period", original: "all evening", date: "2022-11-03", period: "evening" });
    expect(r.category).toBe("direct");
    expect(r.score).toBe(75);
    expect(r.compare?.ruleId).toBe("R_STATE");
    expect(r.compare?.assumptions).toEqual(["vocab_period:evening", "time_tolerance:S1-out"]);
    expect(r.record).toMatchObject({
      policyVersion: POLICY.version,
      baseScore: 85,
      finalScore: 75,
      deduction: { factId: "S1-out", markerText: "I think", transcript: "B" },
    });
    const d = r.record?.deduction;
    expect(d && M.transcripts.B.slice(d.start, d.end)).toBe("I think");
  });

  it('"ordered pizza around 7pm" vs "get some groceries" -> false positive', () => {
    const r = resultFor(results, "M2-pizza", "S1-groceries");
    expect(r.category).toBe("false_positive");
    expect(r.score).toBeNull();
    expect(r.compare?.result).toBe("compatible");
  });

  it('"Around 10, maybe 10:30" vs "Midnight maybe" -> direct 85, relies on tolerance + same-question presumption', () => {
    const r = resultFor(results, "M3-sleep", "S3-sleep");
    expect(r.category).toBe("direct");
    expect(r.score).toBe(85);
    expect(r.compare?.ruleId).toBe("R_EVENT_TIME");
    expect(r.compare?.assumptions).toEqual([
      "same_event:same_question_same_date",
      "time_tolerance:M3-sleep",
      "time_tolerance:S3-sleep",
    ]);
    expect(r.record?.deduction).toBeNull();
  });

  it('"No, I was alone" vs "Tom might have seen me. We waved or something" -> needs review (was Tom actually present?)', () => {
    const r = resultFor(results, "M4-alone", "S4-waved");
    expect(r.category).toBe("needs_review");
    expect(r.score).toBeNull();
    expect(r.compare?.ruleId).toBe("R_TEMPLATE_ALONE_VS_COPRESENT");
    expect(r.compare?.missingConditions).toContain("copresence_not_established:activity.waved");
    expect(r.compare?.missingConditions).toEqual(["copresence_not_established:activity.waved", "space_scope_unconfirmed"]);
  });

  it("never been to the Hargrove Street warehouse vs drove through that area -> false positive", () => {
    const r = resultFor(results, "M5-not-been", "S5-passed");
    expect(r.category).toBe("false_positive");
    expect(r.compare?.ruleId).toBe("R_NEGATION");
  });

  it('"never heard of him before this whole thing started" vs "I knew of him" -> needs review (time not anchored)', () => {
    const r = resultFor(results, "M6-not-known", "S6-knew-of");
    expect(r.category).toBe("needs_review");
    expect(r.compare?.ruleId).toBe("R_NEGATION");
    expect(r.compare?.missingConditions).toContain("time_not_anchored:S6-knew-of");
    // The March side is also unanchored: "this whole thing" is not dated in the testimony.
    expect(r.compare?.missingConditions).toEqual(["time_not_anchored:M6-not-known", "time_not_anchored:S6-knew-of"]);
  });

  it('"Had you met…? No." vs "I don\'t think I\'d met him face to face" -> needs review (polarity undetermined)', () => {
    const r = resultFor(results, "M7-not-met", "S7-met");
    expect(r.category).toBe("needs_review");
    expect(r.compare?.ruleId).toBe("R_NEGATION");
    expect(r.compare?.missingConditions).toEqual(["polarity_undetermined:S7-met"]);
  });

  it('"at home all evening" vs "We waved or something in the parking lot" -> needs review (is the parking lot part of home?)', () => {
    const r = resultFor(results, "M1-home", "S4-parking-lot");
    expect(r.category).toBe("needs_review");
    expect(r.compare?.ruleId).toBe("R_STATE");
    expect(r.compare?.missingConditions).toEqual(["location_relation_unknown:location.home/location.place(parking_lot)"]);
  });

  it("exactly two conclusions depend on default policy (home vs out, sleep time)", () => {
    const withAssumptions = results
      .filter((r) => r.category !== "needs_review" && (r.compare?.assumptions.length ?? 0) > 0)
      .map((r) => `${r.candidate.a.id}/${r.candidate.b.id}`)
      .sort();
    expect(withAssumptions).toEqual(["M1-home/S1-out", "M3-sleep/S3-sleep"]);
  });
});
