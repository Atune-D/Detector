import { describe, expect, it } from "vitest";
import { extractionJsonSchema, extractionZod, normalizeWireExtraction } from "../../src/server/llm/schema";

const base = {
  qaId: "Q1",
  quote: "x",
  person: "witness",
  action: "location.home",
  object: null,
  location: null,
  polarity: "affirmative",
  negationForm: null,
  stateSource: { kind: "explicit" },
  uncertaintyMarkers: [],
  occurrence: null,
};
const wire = (time: Record<string, unknown>) => ({
  facts: [{ ...base, time: { original: "t", date: null, from: null, to: null, markers: [], endDate: null, endMarkers: [], period: null, ...time } }],
});
const parse = (v: unknown) => extractionZod(["Q1"]).safeParse(normalizeWireExtraction(v));

describe("flat wire time -> strict union", () => {
  it("keeps the API schema free of the six-way time union the API rejected", () => {
    const schema = extractionJsonSchema(["Q1"]) as { $defs: { time: { anyOf?: unknown; properties: Record<string, unknown> } } };
    expect(schema.$defs.time.anyOf).toBeUndefined();
    expect(Object.keys(schema.$defs.time.properties)).toContain("endMarkers");
  });

  it("maps every kind", () => {
    const m = [{ text: "around", class: "approx" }];
    const cases: [Record<string, unknown>, unknown][] = [
      [{ kind: "instant", date: "2022-11-03", from: "19:00", to: "19:00", markers: m }, { kind: "instant", original: "t", date: "2022-11-03", from: "19:00", to: "19:00", markers: m }],
      [
        { kind: "interval", date: "2022-11-03", from: "20:00", to: "21:00", markers: m },
        { kind: "interval", original: "t", start: { date: "2022-11-03", time: "20:00", markers: m }, end: { date: "2022-11-03", time: "21:00", markers: [] } },
      ],
      [{ kind: "period", date: "2022-11-03", period: "evening" }, { kind: "period", original: "t", date: "2022-11-03", period: "evening" }],
      [{ kind: "all_time" }, { kind: "all_time", original: "t" }],
      [{ kind: "unanchored", date: "2022-11-03" }, { kind: "unanchored", original: "t" }],
    ];
    for (const [input, expected] of cases) {
      const r = parse(wire(input));
      expect(r.success, JSON.stringify(input)).toBe(true);
      if (r.success) expect(r.data.facts[0]?.time).toEqual(expected);
    }
  });

  it("still rejects a kind missing its required fields", () => {
    expect(parse(wire({ kind: "instant" })).success).toBe(false);
    expect(parse(wire({ kind: "period", date: "2022-11-03" })).success).toBe(false);
  });

  it("leaves the already-strict form (replay, fakes) untouched", () => {
    expect(parse({ facts: [{ ...base, time: { kind: "all_time", original: "never" } }] }).success).toBe(true);
  });
});
