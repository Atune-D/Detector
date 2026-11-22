/**
 * Comparator unit tests beyond the §6.1 rows: self-checks, re-checks on nominated
 * candidates, and dispatcher isolation.
 */
import { describe, expect, it } from "vitest";
import {
  compareAloneVsCopresent,
  compareCandidate,
  compareEventTime,
  compareNegation,
  compareState,
  compareTemplate,
  sameEvent,
  type Fact,
} from "../src/engine";
import { E, at, bound, candidate, span, someTime, allTime } from "./fixtures/builders";
import * as S from "./fixtures/sec61";

const other = (f: Fact, person = "someone_else"): Fact => ({ ...f, person });

describe("negation comparator", () => {
  const { a, b } = S.neverEnteredWarehouseVsWasInItsOffice;

  it("self-check: different person -> unknown", () => {
    expect(compareNegation(a, other(b)).missingConditions).toEqual(["person_mismatch"]);
  });

  it("same polarity -> compatible", () => {
    const r = compareNegation(a, { ...b, polarity: "negative", negationForm: "whole" });
    expect(r.result).toBe("compatible");
  });

  it('self-check: "不确定是否" (certainty negation) -> unknown', () => {
    const r = compareNegation({ ...a, negationForm: "certainty" }, b);
    expect(r).toMatchObject({ result: "unknown", missingConditions: ["negation_form_unsupported:a-not-entered"] });
  });

  it("entering-type containment is one-directional: denying the office, admitting the warehouse -> compatible", () => {
    const r = compareNegation({ ...a, object: E.warehouseOffice }, { ...b, object: E.warehouse });
    expect(r.result).toBe("compatible");
  });

  it("passed_through/been_to relation only clears 'passed the area, denied a place in it'; other shapes -> unknown", () => {
    const { a: notBeen, b: passed } = S.neverBeenToWarehouseVsDroveThroughArea;
    const r = compareNegation(notBeen, { ...passed, object: E.warehouse });
    expect(r).toMatchObject({ result: "unknown", missingConditions: ["predicate_relation_undecided:passed_through_vs_been_to"] });
  });

  it("been_to vs entered are different predicates without a registered relation -> unknown", () => {
    const r = compareNegation({ ...a, action: "been_to" }, b);
    expect(r.missingConditions).toEqual(["predicate_relation_unregistered:been_to/entered"]);
  });

  it("unrelated objects -> unknown (object relation unresolved)", () => {
    const r = compareNegation(a, { ...b, object: E.mall });
    expect(r.missingConditions).toEqual(["object_relation_unresolved"]);
  });

  it("affirmed time not anchored -> unknown", () => {
    const r = compareNegation(a, { ...b, time: { kind: "unanchored", original: "back then" } });
    expect(r.missingConditions).toEqual(["time_not_anchored:b-entered-office"]);
  });

  it("affirmed time only partly inside the negated period -> unknown, never conflict", () => {
    const { a: neg, b: aff } = S.notHomeWholeEveningVsHomeAt8;
    const r = compareNegation(neg, { ...aff, time: at(S.NIGHT, "20:50", [{ text: "maybe", class: "hedge" }]) });
    expect(r).toMatchObject({ result: "unknown", missingConditions: ["time_inside_negation_unconfirmed"] });
  });
});

describe("event-time comparator", () => {
  const { a, b } = S.arrivalExact800VsExact805;

  it("different event types -> unknown", () => {
    expect(compareEventTime(a, { ...b, action: "went_out" }).missingConditions).toEqual(["event_type_mismatch:arrival/went_out"]);
  });

  it("non-event predicates are refused even if nominated", () => {
    const { a: h, b: o } = S.touchingEndpoints;
    expect(compareEventTime(h, { ...o, action: "location.home" }).missingConditions).toEqual(["not_an_event:location.home"]);
  });

  it("same type + same date alone is not the same event", () => {
    const noOcc = (f: Fact): Fact => {
      const { occurrence: _o, ...rest } = f;
      return rest;
    };
    expect(sameEvent(noOcc(a), noOcc(b))).toBe("undetermined");
    expect(sameEvent(a, b)).toBe("same_explicit");
  });

  it("same question + same date -> presumed same event (recorded as assumption)", () => {
    const { a: x, b: y } = S.outingsUndetermined;
    const yy: Fact = { ...y, source: { ...y.source, question: x.source.question } };
    expect(sameEvent(x, yy)).toBe("same_presumed");
    expect(compareEventTime(x, yy)).toMatchObject({
      result: "conflict",
      assumptions: ["same_event:same_question_same_date", "time_tolerance:a-out", "time_tolerance:b-out"],
    });
  });

  it("different dates -> different events -> compatible", () => {
    const r = compareEventTime(a, { ...b, time: at("2023-11-04", "20:05", [{ text: "sharp", class: "exact" }]) });
    expect(r.result).toBe("compatible");
  });

  it("a duration instead of an instant -> unknown (time unparseable; its date cannot anchor the same-event check either)", () => {
    const r = compareEventTime(a, { ...b, time: span(bound(S.NIGHT, "20:00"), bound(S.NIGHT, "21:00"), "8-9") });
    expect(r.missingConditions).toEqual(["same_event_undetermined", "time_unparseable:b-arrival"]);
  });
});

describe("state comparator", () => {
  it("refuses non-affirmative facts", () => {
    const { a, b } = S.homeAllEveningVsWentOut;
    expect(compareState({ ...a, polarity: "negative", negationForm: "whole" }, b).missingConditions).toEqual(["not_affirmative:a-home"]);
  });

  it("unregistered non-location combination -> unknown with state_relation_unregistered", () => {
    const { a, b } = S.aloneVsNotAlone;
    const r = compareState(a, { ...b, action: "sleep_state.awake" });
    expect(r.missingConditions).toEqual(["state_relation_unregistered:company.alone/sleep_state.awake"]);
  });

  it("registered coexistence (home + watching TV) -> compatible regardless of time", () => {
    const { a, b } = S.homeAllEveningVsWentOut;
    expect(compareState(a, { ...b, action: "activity.watching_tv" }).result).toBe("compatible");
  });

  it("no whole-dimension shortcut: same state value twice is not registered -> unknown", () => {
    const { a, b } = S.homeAllEveningVsWentOut;
    expect(compareState(a, { ...b, action: "location.home" }).result).toBe("unknown");
  });

  it("exclusive but only possibly overlapping -> unknown (time_overlap_unconfirmed)", () => {
    const { a, b } = S.homeAllEveningVsWentOut;
    const r = compareState(a, { ...b, time: at(S.NIGHT, "20:45", [{ text: "maybe", class: "hedge" }]) });
    expect(r).toMatchObject({ result: "unknown", missingConditions: ["time_overlap_unconfirmed"] });
  });
});

describe("alone-vs-copresent template", () => {
  const { a, b } = S.aloneInOfficeVsFaceToFaceInOffice;

  it("role assignment does not depend on candidate order", () => {
    expect(compareAloneVsCopresent(b, a).result).toBe("conflict");
  });

  it("never returns compatible, even when time ranges are disjoint", () => {
    const r = compareAloneVsCopresent(a, { ...b, time: at(S.NIGHT, "20:00") });
    expect(r).toMatchObject({ result: "unknown", missingConditions: ["copresence_time_unconfirmed"] });
  });

  it('"might have seen me" style uncertainty on the other person blocks slot 3', () => {
    const r = compareAloneVsCopresent(a, { ...b, uncertaintyMarkers: [{ text: "might", modifies: "others_action", span: { start: 0, end: 5 } }] });
    expect(r.missingConditions).toEqual(["copresence_not_established:activity.conversation_face_to_face"]);
  });

  it("an alone claim without a spatial scope or a certain period fails slot 2", () => {
    const { location: _l, ...noScope } = a;
    const r = compareAloneVsCopresent({ ...noScope, time: someTime() }, b);
    expect(r.result).toBe("unknown");
    expect(r.missingConditions).toEqual([
      "alone_claim_not_established:no_space_scope",
      "alone_claim_not_established:no_certain_period",
      "copresence_time_unconfirmed",
      "space_scope_unconfirmed",
    ]);
  });

  it("neither side is an alone claim -> unknown", () => {
    expect(compareAloneVsCopresent(b, b).missingConditions).toEqual(["alone_claim_not_established:shape"]);
  });

  it("unimplemented template id -> R_TEMPLATE_NONE, unknown", () => {
    expect(compareTemplate("R_TEMPLATE_ASLEEP_VS_ACTIVE", a, b)).toMatchObject({
      result: "unknown",
      ruleId: "R_TEMPLATE_NONE",
      missingConditions: ["template_not_implemented:R_TEMPLATE_ASLEEP_VS_ACTIVE"],
    });
  });
});

describe("dispatcher", () => {
  it("routes only to the candidate's own comparator (state facts nominated as negation get R_NEGATION)", () => {
    const { a, b } = S.homeAllEveningVsWentOut;
    const r = compareCandidate(candidate(a, b, "negation"));
    expect(r.ruleId).toBe("R_NEGATION");
    expect(r.result).toBe("unknown");
    expect(r.missingConditions).toEqual(["predicate_relation_unregistered:location.home/location.out"]);
  });

  it("the face-to-face pair nominated as state cannot produce a direct conflict", () => {
    const { a, b } = S.aloneInOfficeVsFaceToFaceInOffice;
    expect(compareCandidate(candidate(a, b, "state")).result).toBe("unknown");
  });

  it("re-checks that the pair spans both transcripts", () => {
    const { a } = S.homeAllEveningVsWentOut;
    expect(compareCandidate(candidate(a, a, "state")).missingConditions).toEqual(["not_cross_transcript"]);
  });

  it("evidence refs point at both quotes", () => {
    const { a, b } = S.neverEnteredWarehouseVsWasInItsOffice;
    const r = compareCandidate(candidate(a, b, "negation"));
    expect(r.evidenceRefs.map((e) => [e.factId, e.transcript, e.quote])).toEqual([
      ["a-not-entered", "A", a.source.quote],
      ["b-entered-office", "B", b.source.quote],
    ]);
  });

  it("all_time vs all_time negations of the same thing are compatible (same polarity)", () => {
    const { a } = S.neverEnteredWarehouseVsWasInItsOffice;
    const b2: Fact = { ...a, id: "b2", time: allTime(), source: { ...a.source, transcript: "B" } };
    expect(compareCandidate(candidate(a, b2, "negation")).result).toBe("compatible");
  });
});
