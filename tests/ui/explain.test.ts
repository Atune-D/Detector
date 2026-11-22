import { describe, expect, it } from "vitest";
import { ASSUMPTION, MISSING, RULE_IDS } from "../../src/engine";
import {
  ASSUMPTION_TEXT,
  MISSING_TEXT,
  RULE_TEXT,
  errorText,
  explainAssumption,
  explainMissing,
  factContext,
  failureText,
  ruleText,
} from "../../src/ui/explain";
import { mockResults } from "./mockResponse";

describe("code -> text maps", () => {
  it("cover every rule id, missing code and assumption code the engine defines", () => {
    for (const id of Object.values(RULE_IDS)) expect(RULE_TEXT[id]).toBeTruthy();
    for (const code of Object.values(MISSING)) expect(MISSING_TEXT[code]).toBeTruthy();
    for (const code of Object.values(ASSUMPTION)) expect(ASSUMPTION_TEXT[code]).toBeTruthy();
  });

  it("render a rule id as a sentence, and an unknown rule as its raw id", () => {
    expect(ruleText("R_STATE")).toMatch(/^State rule: /);
    expect(ruleText("R_SOMETHING_NEW")).toBe("R_SOMETHING_NEW");
  });
});

describe("explainMissing", () => {
  it("maps a bare code", () => {
    const e = explainMissing("person_mismatch");
    expect(e).toMatchObject({ known: true, detail: null, text: MISSING_TEXT.person_mismatch });
  });

  it("maps the code:detail form and keeps the detail", () => {
    const e = explainMissing("state_relation_unregistered:location.home/activity.waved");
    expect(e.known).toBe(true);
    expect(e.text).toBe(MISSING_TEXT.state_relation_unregistered);
    expect(e.detail).toBe("location.home/activity.waved");
  });

  it("resolves a fact-id detail to its transcript", () => {
    const r = mockResults[0];
    if (!r) throw new Error("fixture");
    const e = explainMissing(`time_not_anchored:${r.candidate.b.id}`, factContext(r));
    expect(e.detail).toBe("statement in Transcript B");
  });

  it("falls back to the raw code for unknown codes, with or without a detail", () => {
    expect(explainMissing("brand_new_code")).toEqual({ text: "brand_new_code", detail: null, known: false, raw: "brand_new_code" });
    expect(explainMissing("brand_new_code:x")).toMatchObject({ text: "brand_new_code:x", known: false });
    expect(explainMissing(":x")).toMatchObject({ text: ":x", known: false });
  });

  it("treats an empty detail as no detail", () => {
    expect(explainMissing("person_mismatch:")).toMatchObject({ known: true, detail: null });
  });
});

describe("explainAssumption", () => {
  it("matches a code that itself contains a colon before splitting on it", () => {
    const e = explainAssumption("same_event:same_question_same_date");
    expect(e).toMatchObject({ known: true, detail: null, text: ASSUMPTION_TEXT["same_event:same_question_same_date"] });
  });

  it("maps vocab_period:<name> and time_tolerance:<factId>", () => {
    expect(explainAssumption("vocab_period:evening")).toMatchObject({ known: true, detail: "evening" });
    const r = mockResults[1];
    if (!r) throw new Error("fixture");
    expect(explainAssumption(`time_tolerance:${r.candidate.b.id}`, factContext(r)).detail).toBe("statement in Transcript B");
  });

  it("does not match a different suffix of a colon-containing code", () => {
    expect(explainAssumption("same_event:something_else").known).toBe(false);
  });
});

describe("failure and error text", () => {
  it("maps known codes and falls back to raw", () => {
    expect(failureText("upstream_timeout")).toMatch(/did not respond in time/);
    expect(failureText("mystery")).toBe("mystery");
    expect(errorText("quote_invalid")).toMatch(/not found at its stated position/);
    expect(errorText("other")).toBe("other");
  });
});
