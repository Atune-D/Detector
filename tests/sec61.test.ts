/**
 * Spec §6.1 behaviour rows, at the engine layer: hand-built facts -> candidate ->
 * quote validation -> the one comparator of the candidate's kind -> scoring.
 */
import { describe, expect, it } from "vitest";
import {
  POLICY,
  analyzeCandidate,
  analyzeRun,
  buildCandidates,
  compareState,
  isEmpty,
  resolveTime,
  type CandidateResult,
  type CompareKind,
  type Fact,
  type Transcripts,
} from "../src/engine";
import { candidate } from "./fixtures/builders";
import * as S from "./fixtures/sec61";

interface Sc {
  transcripts: Transcripts;
  a: Fact;
  b: Fact;
}

function run(sc: Sc, kind: CompareKind, templateId?: string | null): CandidateResult {
  return analyzeCandidate(candidate(sc.a, sc.b, kind, templateId), sc.transcripts);
}

function expectOutcome(
  r: CandidateResult,
  exp: { category: CandidateResult["category"]; score: number | null; ruleId: string; missing?: string[]; assumptions?: string[] },
) {
  expect(r.errors).toEqual([]);
  expect(r.category).toBe(exp.category);
  expect(r.score).toBe(exp.score);
  expect(r.compare?.ruleId).toBe(exp.ruleId);
  expect(r.record?.ruleId).toBe(exp.ruleId);
  expect(r.record?.finalScore).toBe(exp.score);
  expect(r.compare?.missingConditions).toEqual(exp.missing ?? []);
  expect(r.compare?.assumptions).toEqual(exp.assumptions ?? []);
  expect(r.record?.missingConditions).toEqual(exp.missing ?? []);
  expect(r.record?.assumptions).toEqual(exp.assumptions ?? []);
}

describe("§6.1 state comparator rows", () => {
  it('同一晚"一直在家" vs "出去买菜" -> direct 85 (relies on evening vocabulary)', () => {
    const r = run(S.homeAllEveningVsWentOut, "state");
    expectOutcome(r, {
      category: "direct",
      score: 85,
      ruleId: "R_STATE",
      assumptions: ["vocab_period:evening", "time_tolerance:b-out"],
    });
    expect(r.record?.deduction).toBeNull();
  });

  it('同上，但后者是 "I think I went out" -> direct 75, deduction recorded with offsets', () => {
    const sc = S.homeAllEveningVsIThinkWentOut;
    const r = run(sc, "state");
    expectOutcome(r, {
      category: "direct",
      score: 75,
      ruleId: "R_STATE",
      assumptions: ["vocab_period:evening", "time_tolerance:b-out"],
    });
    expect(r.record?.baseScore).toBe(85);
    const d = r.record?.deduction;
    expect(d).toMatchObject({ amount: 10, factId: "b-out", transcript: "B", markerText: "I think" });
    expect(d && sc.transcripts.B.slice(d.start, d.end)).toBe("I think");
  });

  it('"订披萨" vs "买菜" -> false positive', () => {
    expectOutcome(run(S.pizzaVsGroceries, "state"), { category: "false_positive", score: null, ruleId: "R_STATE" });
  });

  it("昨天在家 vs 今天在商场 -> false positive (time disjoint)", () => {
    expectOutcome(run(S.homeYesterdayVsMallToday, "state"), { category: "false_positive", score: null, ruleId: "R_STATE" });
  });

  it('"20:00–21:00 在家" vs "21:05–21:15 在超市" -> false positive', () => {
    expectOutcome(run(S.home20to21VsSupermarket2105, "state"), { category: "false_positive", score: null, ruleId: "R_STATE" });
  });

  it("在家 vs 在停车场挥手，停车场位置不明 -> needs review", () => {
    expectOutcome(run(S.homeVsParkingLot, "state"), {
      category: "needs_review",
      score: null,
      ruleId: "R_STATE",
      missing: ["location_relation_unknown:location.home/location.place(parking_lot)"],
    });
  });

  it('同一时段"始终在家" vs "在外地开车" -> direct 85, not a cross-dimension false positive', () => {
    expectOutcome(run(S.homeVsDrivingOutOfTown, "state"), {
      category: "direct",
      score: 85,
      ruleId: "R_STATE",
      assumptions: ["time_tolerance:b-springfield"],
    });
  });

  it('"只有我一个人" vs "当时不止我一个人" -> direct 85', () => {
    expectOutcome(run(S.aloneVsNotAlone, "state"), {
      category: "direct",
      score: 85,
      ruleId: "R_STATE",
      assumptions: ["time_tolerance:b-accompanied"],
    });
  });

  it("持续状态收缩后确定范围为空 -> needs review; overlap not confirmed, endpoints not swapped", () => {
    const sc = S.emptyCertainRange;
    const t = resolveTime(sc.a.time);
    expect(t.kind).toBe("resolved");
    if (t.kind !== "resolved") return;
    expect(isEmpty(t.certain)).toBe(true);
    expect(t.certain.start).toBeGreaterThan(t.certain.end); // [20:20, 20:00) kept as is
    expectOutcome(run(sc, "state"), {
      category: "needs_review",
      score: null,
      ruleId: "R_STATE",
      missing: ["time_overlap_unconfirmed"],
    });
  });

  it('"20:00–21:00 在家" vs "21:00–22:00 在外" -> false positive (endpoints only touch)', () => {
    expectOutcome(run(S.touchingEndpoints, "state"), { category: "false_positive", score: null, ruleId: "R_STATE" });
  });
});

describe("§6.1 event-time comparator rows", () => {
  it('同一次到达"大约 8 点" vs "8:05" -> false positive', () => {
    expectOutcome(run(S.arrivalAround8Vs805, "event_time"), {
      category: "false_positive",
      score: null,
      ruleId: "R_EVENT_TIME",
      assumptions: ["time_tolerance:a-arrival", "time_tolerance:b-arrival"],
    });
  });

  it('同一次到达"准确 8:00" vs "准确 8:05" -> direct 85', () => {
    expectOutcome(run(S.arrivalExact800VsExact805, "event_time"), { category: "direct", score: 85, ruleId: "R_EVENT_TIME" });
  });

  it("证词明确说明是两次不同的外出 -> false positive", () => {
    expectOutcome(run(S.twoDistinctOutings, "event_time"), { category: "false_positive", score: null, ruleId: "R_EVENT_TIME" });
  });

  it("两个外出时间不同，无法确定是不是同一次 -> needs review (same event?)", () => {
    expectOutcome(run(S.outingsUndetermined, "event_time"), {
      category: "needs_review",
      score: null,
      ruleId: "R_EVENT_TIME",
      missing: ["same_event_undetermined"],
    });
  });
});

describe("§6.1 negation comparator rows", () => {
  it("没去过仓库 vs 开车经过附近 -> false positive (passed_through vs been_to)", () => {
    expectOutcome(run(S.neverBeenToWarehouseVsDroveThroughArea, "negation"), { category: "false_positive", score: null, ruleId: "R_NEGATION" });
  });

  it("没进过仓库 vs 去过仓库里的办公室 -> direct 85", () => {
    expectOutcome(run(S.neverEnteredWarehouseVsWasInItsOffice, "negation"), { category: "direct", score: 85, ruleId: "R_NEGATION" });
  });

  it("没买过整栋楼 vs 买过其中一套公寓 -> needs review (no containment rule)", () => {
    expectOutcome(run(S.neverBoughtBuildingVsBoughtApartment, "negation"), {
      category: "needs_review",
      score: null,
      ruleId: "R_NEGATION",
      missing: ["containment_rule_unregistered:bought"],
    });
  });

  it("去年不认识 vs 今年认识 -> false positive", () => {
    expectOutcome(run(S.didNotKnowLastYearVsKnowsThisYear, "negation"), { category: "false_positive", score: null, ruleId: "R_NEGATION" });
  });

  it('"没有整晚在家" vs "8 点在家" -> needs review (unsupported negation form), never conflict', () => {
    expectOutcome(run(S.notHomeAllEveningUniversalVsHomeAt8, "negation"), {
      category: "needs_review",
      score: null,
      ruleId: "R_NEGATION",
      missing: ["negation_form_unsupported:a-not-all-evening"],
    });
  });

  it('"整晚都不在家" vs "当晚 8 点在家" -> direct 85', () => {
    expectOutcome(run(S.notHomeWholeEveningVsHomeAt8, "negation"), {
      category: "direct",
      score: 85,
      ruleId: "R_NEGATION",
      assumptions: ["vocab_period:evening", "time_tolerance:b-home-8"],
    });
  });

  it('"没看见 Tom" vs "和 Tom 说过话" -> needs review (different predicates, no relation rule)', () => {
    expectOutcome(run(S.didNotSeeTomVsTalkedWithTom, "negation"), {
      category: "needs_review",
      score: null,
      ruleId: "R_NEGATION",
      missing: ["predicate_relation_unregistered:saw/talked_with"],
    });
  });
});

describe("§6.1 template rows", () => {
  const T = "R_TEMPLATE_ALONE_VS_COPRESENT";

  it("办公室始终只有自己 vs 同一时段与 Tom 在该办公室面对面交谈 -> inferential 75, only this one candidate", () => {
    const sc = S.aloneInOfficeVsFaceToFaceInOffice;
    expectOutcome(run(sc, "template", T), {
      category: "inferential",
      score: 75,
      ruleId: T,
      assumptions: ["time_tolerance:b-f2f-office"],
    });
    const { candidates } = buildCandidates([sc.a], [sc.b]);
    expect(candidates.map((c) => [c.kind, c.templateId])).toEqual([["template", T]]);
    const runResult = analyzeRun(candidates, sc.transcripts);
    expect(runResult.status).toBe("completed");
    if (runResult.status !== "completed") return;
    expect(runResult.results.map((x) => [x.category, x.score])).toEqual([["inferential", 75]]);
  });

  it("办公室始终只有自己 vs 同一时段与 Tom 在楼下大厅交谈 -> needs review (space scope)", () => {
    expectOutcome(run(S.aloneInOfficeVsFaceToFaceInLobby, "template", T), {
      category: "needs_review",
      score: null,
      ruleId: T,
      missing: ["space_scope_unconfirmed"],
    });
  });

  it("10 点睡着 vs 11 点有活动 -> needs review (no template); program pairing builds nothing", () => {
    const sc = S.asleepAt10VsActiveAt11;
    expectOutcome(run(sc, "template", null), {
      category: "needs_review",
      score: null,
      ruleId: "R_TEMPLATE_NONE",
      missing: ["template_not_implemented:none"],
    });
    expect(buildCandidates([sc.a], [sc.b]).candidates).toEqual([]);
  });

  it('"面对面交谈"被写成"有人在场"且来源标为推导 -> template only, never the state comparator', () => {
    const sc = S.aloneInOfficeVsFaceToFaceInOffice;
    expect(sc.b.action).toBe("company.accompanied");
    expect(sc.b.stateSource.kind).toBe("derived");
    // Program pairing does not route it to state.
    expect(buildCandidates([sc.a], [sc.b]).candidates.some((c) => c.kind === "state")).toBe(false);
    // Even if someone nominates it for state, the state comparator refuses derived facts.
    const r = compareState(sc.a, sc.b);
    expect(r.result).toBe("unknown");
    expect(r.missingConditions).toEqual(["state_source_not_explicit:b-f2f-office"]);
  });

  it('"给 Tom 打了电话" vs "始终只有自己" -> needs review (co-presence not inferable); not program-paired', () => {
    const sc = S.aloneInOfficeVsPhoneCall;
    expectOutcome(run(sc, "template", T), {
      category: "needs_review",
      score: null,
      ruleId: T,
      missing: ["copresence_not_established:activity.phone_call"],
    });
    expect(buildCandidates([sc.a], [sc.b]).candidates).toEqual([]);
  });
});

describe("§6.1 candidate / run rows", () => {
  it('"订过披萨"和"认识 Tom"，没有人提出冲突理由 -> no candidate', () => {
    const sc = S.pizzaVsKnowsTom;
    const { candidates, rejectedNominations } = buildCandidates([sc.a], [sc.b], []);
    expect(candidates).toEqual([]);
    expect(rejectedNominations).toEqual([]);
  });

  it("原文引用不存在 -> analysis error (no score, no comparison)", () => {
    const sc = S.homeAllEveningVsWentOut;
    const bad: Fact = { ...sc.b, source: { ...sc.b.source, quote: "I never left the house." } };
    const c = candidate(sc.a, bad, "state");
    const r = analyzeCandidate(c, sc.transcripts);
    expect(r.category).toBe("analysis_error");
    expect(r.score).toBeNull();
    expect(r.compare).toBeNull();
    expect(r.record).toBeNull();
    expect(r.errors.map((e) => [e.code, e.factId])).toEqual([["quote_invalid", "b-out"]]);

    const good = candidate(sc.a, sc.b, "state");
    const runResult = analyzeRun([good, c], sc.transcripts);
    expect(runResult.status).toBe("completed_partial");
    if (runResult.status !== "completed_partial") return;
    expect(runResult.errorCount).toBe(1);
    expect(runResult.results.map((x) => x.category)).toEqual(["direct", "analysis_error"]);
  });

  it("正常分析没有候选 -> completed, empty result", () => {
    const sc = S.pizzaVsKnowsTom;
    const { candidates } = buildCandidates([sc.a], [sc.b]);
    expect(analyzeRun(candidates, sc.transcripts)).toEqual({ status: "completed_empty", results: [] });
  });

  it("scoring record carries the policy version", () => {
    const r = run(S.arrivalExact800VsExact805, "event_time");
    expect(r.record?.policyVersion).toBe(POLICY.version);
  });
});
