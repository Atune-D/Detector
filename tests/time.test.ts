import { describe, expect, it } from "vitest";
import {
  POLICY,
  absoluteMinute,
  confirmedOverlap,
  contains,
  dayNumber,
  intersects,
  isEmpty,
  possiblyDisjoint,
  resolveTime,
  widening,
  type ResolvedTime,
  type TimeSpec,
} from "../src/engine";
import { at, atRange, bound, hm, period, span, tm } from "./fixtures/builders";

const D = "2023-11-03";
const base = absoluteMinute(D, 0) ?? NaN;
const T = (s: string) => base + hm(s);

function resolved(spec: TimeSpec): Extract<ResolvedTime, { kind: "resolved" }> {
  const r = resolveTime(spec);
  if (r.kind !== "resolved") throw new Error(`expected resolved, got ${r.kind}`);
  return r;
}

describe("calendar", () => {
  it("dayNumber matches the proleptic Gregorian calendar", () => {
    expect(dayNumber("1970-01-01")).toBe(0);
    expect(dayNumber("2000-03-01")).toBe(11017);
    expect(dayNumber(D)).toBe(Date.UTC(2023, 10, 3) / 86_400_000);
    expect(dayNumber("2023-13-01")).toBeNull();
    expect(dayNumber("Nov 3")).toBeNull();
  });
});

describe("instant widening (§3.2)", () => {
  it("uses the policy table: exact 0, unmarked 5, approx 20, hedge 30", () => {
    expect(widening([], POLICY.instantWidening)).toBe(5);
    expect(widening([tm("exactly", "exact")], POLICY.instantWidening)).toBe(0);
    expect(widening([tm("around", "approx")], POLICY.instantWidening)).toBe(20);
    expect(widening([tm("maybe", "hedge")], POLICY.instantWidening)).toBe(30);
  });

  it("widest marker wins; markers never stack", () => {
    expect(widening([tm("around", "approx"), tm("maybe", "hedge")], POLICY.instantWidening)).toBe(30);
    expect(widening([tm("exactly", "exact"), tm("about", "approx")], POLICY.instantWidening)).toBe(20);
  });

  it("duration bounds given as plain clock times are not widened", () => {
    expect(widening([], POLICY.boundWidening)).toBe(0);
    expect(widening([tm("about", "approx")], POLICY.boundWidening)).toBe(20);
  });

  it('"10, maybe 10:30" parses to 22:00–22:30 then widens to 21:30–23:00; "Midnight maybe" is 23:30–24:30; disjoint', () => {
    const a = resolved(atRange(D, "22:00", "22:30", [tm("Around", "approx"), tm("maybe", "hedge")], "Around 10, maybe 10:30"));
    const b = resolved(at(D, "24:00", [tm("maybe", "hedge")], "Midnight maybe"));
    expect(a.possible).toEqual({ start: T("21:30"), end: T("23:00"), endInclusive: true });
    expect(b.possible).toEqual({ start: T("23:30"), end: T("24:30"), endInclusive: true });
    expect(possiblyDisjoint(a, b)).toBe(true);
    expect(a.tolerance && b.tolerance).toBe(true);
  });

  it("exact 8:00 vs exact 8:05 are disjoint points; exact 8:00 vs exact 8:00 coincide", () => {
    const x = resolved(at(D, "20:00", [tm("exactly", "exact")]));
    const y = resolved(at(D, "20:05", [tm("exactly", "exact")]));
    const z = resolved(at(D, "20:00", [tm("sharp", "exact")]));
    expect(x.possible).toEqual({ start: T("20:00"), end: T("20:00"), endInclusive: true });
    expect(x.tolerance).toBe(false);
    expect(possiblyDisjoint(x, y)).toBe(true);
    expect(possiblyDisjoint(x, z)).toBe(false);
  });

  it('"around 8" (19:40–20:20) vs "8:05" (20:00–20:10) intersect', () => {
    const x = resolved(at(D, "20:00", [tm("around", "approx")]));
    const y = resolved(at(D, "20:05"));
    expect(x.possible).toEqual({ start: T("19:40"), end: T("20:20"), endInclusive: true });
    expect(y.possible).toEqual({ start: T("20:00"), end: T("20:10"), endInclusive: true });
    expect(possiblyDisjoint(x, y)).toBe(false);
  });

  it("only an exact single moment has a (point) certain range", () => {
    expect(isEmpty(resolved(at(D, "20:00", [tm("exactly", "exact")])).certain)).toBe(false);
    expect(isEmpty(resolved(at(D, "20:00")).certain)).toBe(true);
    expect(isEmpty(resolved(atRange(D, "22:00", "22:30", [tm("exactly", "exact")], "10 to 10:30 exactly")).certain)).toBe(true);
  });

  it("an inverted instant range is unparseable, never swapped", () => {
    expect(resolveTime({ kind: "instant", original: "x", date: D, from: hm("22:30"), to: hm("22:00"), markers: [] }).kind).toBe("unparseable");
  });
});

describe("durations, certain vs possible (§3.3)", () => {
  it("plain clock bounds: certain == possible, half-open, no tolerance", () => {
    const r = resolved(span(bound(D, "20:00"), bound(D, "21:00"), "8 to 9"));
    expect(r.certain).toEqual({ start: T("20:00"), end: T("21:00"), endInclusive: false });
    expect(r.possible).toEqual(r.certain);
    expect(r.tolerance).toBe(false);
  });

  it("fuzzy bounds shrink the certain range inward and widen the possible range outward", () => {
    const r = resolved(span(bound(D, "19:00", [tm("about", "approx")]), bound(D, "22:00", [tm("maybe", "hedge")]), "about 7 to maybe 10"));
    expect(r.certain).toEqual({ start: T("19:20"), end: T("21:30"), endInclusive: false });
    expect(r.possible).toEqual({ start: T("18:40"), end: T("22:30"), endInclusive: false });
    expect(r.tolerance).toBe(true);
  });

  it('empty certain range ("about 8:00 to about 8:20"): kept as [8:20, 8:00), empty, confirms nothing', () => {
    const r = resolved(span(bound(D, "20:00", [tm("about", "approx")]), bound(D, "20:20", [tm("about", "approx")]), "about 8 to about 8:20"));
    expect(r.certain).toEqual({ start: T("20:20"), end: T("20:00"), endInclusive: false });
    expect(isEmpty(r.certain)).toBe(true);
    // An empty range never intersects or contains anything — not even a range covering all of it.
    const everything = { start: -Infinity, end: Infinity, endInclusive: false };
    expect(intersects(r.certain, everything)).toBe(false);
    expect(contains(r.certain, { start: T("20:10"), end: T("20:10"), endInclusive: true })).toBe(false);
    expect(contains(everything, r.certain)).toBe(false);
    const exactPoint = resolved(at(D, "20:10", [tm("exactly", "exact")]));
    expect(confirmedOverlap(r, exactPoint)).toBe(false);
    expect(confirmedOverlap(r, r)).toBe(false);
  });

  it("touching endpoints [20,21) and [21,22) do not overlap; an exact 21:00 belongs only to the second", () => {
    const x = resolved(span(bound(D, "20:00"), bound(D, "21:00"), "8-9"));
    const y = resolved(span(bound(D, "21:00"), bound(D, "22:00"), "9-10"));
    expect(possiblyDisjoint(x, y)).toBe(true);
    expect(confirmedOverlap(x, y)).toBe(false);
    const nine = resolved(at(D, "21:00", [tm("exactly", "exact")]));
    expect(confirmedOverlap(x, nine)).toBe(false);
    expect(confirmedOverlap(y, nine)).toBe(true);
  });

  it("an inverted interval is unparseable, never swapped", () => {
    expect(resolveTime(span(bound(D, "21:00"), bound(D, "20:00"), "9 to 8")).kind).toBe("unparseable");
  });
});

describe("vocabulary periods and other kinds", () => {
  it('"evening" comes from the policy table and is flagged as vocabulary-derived', () => {
    const r = resolved(period(D, "evening"));
    expect(r.certain).toEqual({ start: T("18:00"), end: T("21:00"), endInclusive: false });
    expect(r.possible).toEqual({ start: T("17:00"), end: T("24:00"), endInclusive: false });
    expect(r.vocabularyPeriod).toBe("evening");
  });

  it("unknown vocabulary period is unparseable; unanchored stays unanchored", () => {
    expect(resolveTime(period(D, "dusk")).kind).toBe("unparseable");
    expect(resolveTime({ kind: "unanchored", original: "back then" }).kind).toBe("unanchored");
  });

  it("all_time covers everything for sure; some_time guarantees nothing", () => {
    const all = resolved({ kind: "all_time", original: "never" });
    const some = resolved({ kind: "some_time", original: "once" });
    expect(isEmpty(some.certain)).toBe(true);
    expect(confirmedOverlap(all, some)).toBe(true);
    expect(confirmedOverlap(some, some)).toBe(false);
  });

  it("confirmed overlap = certain ranges intersect, or one possible range inside the other's certain range", () => {
    const evening = resolved(period(D, "evening"));
    const around730 = resolved(at(D, "19:30", [tm("maybe", "hedge")]));
    expect(confirmedOverlap(evening, around730)).toBe(true); // 19:00–20:00 ⊂ 18:00–21:00
    const around2045 = resolved(at(D, "20:45", [tm("maybe", "hedge")])); // 20:15–21:15 leaks past 21:00
    expect(confirmedOverlap(evening, around2045)).toBe(false);
    expect(possiblyDisjoint(evening, around2045)).toBe(false);
  });
});
