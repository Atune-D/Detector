/**
 * Time policy (spec §3.2, §3.3). Pure: no Date.now, no locale, no timezone.
 *
 * Timeline unit: minutes since 1970-01-01 00:00 of a floating (zone-less) calendar.
 *
 * Range semantics:
 * - Durations are half-open [start, end).
 * - Instants are closed [start, end] so that an exact moment is a point that can
 *   lie inside a half-open duration (start <= t < end).
 * - A range may be empty (start > end, or start == end and half-open). Empty
 *   ranges are kept as computed — endpoints are NEVER swapped to repair them —
 *   and an empty range never confirms anything.
 */
import { POLICY, type Policy } from "./config";
import type { Fact, TimeMarker, TimeSpec } from "./types";

export interface Range {
  start: number;
  end: number;
  endInclusive: boolean;
}

export type ResolvedTime =
  | {
      kind: "resolved";
      /** Times the testimony guarantees are covered. May be empty. */
      certain: Range;
      /** Times the testimony could possibly mean. */
      possible: Range;
      /** True when a non-zero tolerance (widen/shrink) from the policy was applied. */
      tolerance: boolean;
      /** Name of the vocabulary period used, if any. */
      vocabularyPeriod: string | null;
    }
  | { kind: "unanchored" }
  | { kind: "unparseable"; reason: string };

const MINUTES_PER_DAY = 1440;

/** Days since 1970-01-01 for a proleptic Gregorian date "YYYY-MM-DD"; null if malformed. */
export function dayNumber(date: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const y0 = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  // Howard Hinnant's days_from_civil.
  const y = mo <= 2 ? y0 - 1 : y0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = (mo + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Absolute minute for a date + minutes-from-midnight; null if the date is malformed. */
export function absoluteMinute(date: string, minute: number): number | null {
  const day = dayNumber(date);
  if (day === null || !Number.isFinite(minute)) return null;
  return day * MINUTES_PER_DAY + minute;
}

type WideningTable = Policy["instantWidening"] | Policy["boundWidening"];

/** Widest marker wins; markers never stack. No marker -> "unmarked". */
export function widening(markers: readonly TimeMarker[], table: WideningTable): number {
  if (markers.length === 0) return table.unmarked;
  let w = 0;
  for (const m of markers) w = Math.max(w, table[m.class]);
  return w;
}

export const EMPTY_RANGE: Range = { start: 0, end: 0, endInclusive: false };
const ALL_TIME: Range = { start: -Infinity, end: Infinity, endInclusive: false };

export function resolveTime(spec: TimeSpec, policy: Policy = POLICY): ResolvedTime {
  switch (spec.kind) {
    case "instant": {
      const base = absoluteMinute(spec.date, 0);
      if (base === null) return { kind: "unparseable", reason: `bad date ${spec.date}` };
      if (!(spec.from <= spec.to)) return { kind: "unparseable", reason: "instant range inverted" };
      const w = widening(spec.markers, policy.instantWidening);
      const lo = base + spec.from;
      const hi = base + spec.to;
      const possible: Range = { start: lo - w, end: hi + w, endInclusive: true };
      // Only an exact single moment is a guaranteed point; anything else guarantees nothing.
      const certain: Range = lo === hi && w === 0 ? { start: lo, end: hi, endInclusive: true } : EMPTY_RANGE;
      return { kind: "resolved", certain, possible, tolerance: w > 0, vocabularyPeriod: null };
    }
    case "interval": {
      const s = absoluteMinute(spec.start.date, spec.start.minute);
      const e = absoluteMinute(spec.end.date, spec.end.minute);
      if (s === null || e === null) return { kind: "unparseable", reason: "bad interval date" };
      if (s > e) return { kind: "unparseable", reason: "interval bounds inverted" };
      const ws = widening(spec.start.markers, policy.boundWidening);
      const we = widening(spec.end.markers, policy.boundWidening);
      // Certain range shrinks inward and may become empty; it is never swapped.
      const certain: Range = { start: s + ws, end: e - we, endInclusive: false };
      const possible: Range = { start: s - ws, end: e + we, endInclusive: false };
      return { kind: "resolved", certain, possible, tolerance: ws > 0 || we > 0, vocabularyPeriod: null };
    }
    case "period": {
      const base = absoluteMinute(spec.date, 0);
      if (base === null) return { kind: "unparseable", reason: `bad date ${spec.date}` };
      const p = policy.vocabularyPeriods[spec.period];
      if (!p) return { kind: "unparseable", reason: `period "${spec.period}" not in vocabulary table` };
      return {
        kind: "resolved",
        certain: { start: base + p.certain.start, end: base + p.certain.end, endInclusive: false },
        possible: { start: base + p.possible.start, end: base + p.possible.end, endInclusive: false },
        tolerance: false,
        vocabularyPeriod: spec.period,
      };
    }
    case "all_time":
      return { kind: "resolved", certain: ALL_TIME, possible: ALL_TIME, tolerance: false, vocabularyPeriod: null };
    case "some_time":
      return { kind: "resolved", certain: EMPTY_RANGE, possible: ALL_TIME, tolerance: false, vocabularyPeriod: null };
    case "unanchored":
      return { kind: "unanchored" };
  }
}

export function isEmpty(r: Range): boolean {
  return !(r.start < r.end || (r.start === r.end && r.endInclusive));
}

export function intersects(a: Range, b: Range): boolean {
  if (isEmpty(a) || isEmpty(b)) return false;
  const lo = Math.max(a.start, b.start);
  let hi: number;
  let hiInclusive: boolean;
  if (a.end < b.end) {
    hi = a.end;
    hiInclusive = a.endInclusive;
  } else if (b.end < a.end) {
    hi = b.end;
    hiInclusive = b.endInclusive;
  } else {
    hi = a.end;
    hiInclusive = a.endInclusive && b.endInclusive;
  }
  return lo < hi || (lo === hi && hiInclusive);
}

/** inner ⊆ outer, both non-empty. */
export function contains(outer: Range, inner: Range): boolean {
  if (isEmpty(outer) || isEmpty(inner)) return false;
  if (outer.start > inner.start) return false;
  if (inner.end < outer.end) return true;
  return inner.end === outer.end && (outer.endInclusive || !inner.endInclusive);
}

type Resolved = Extract<ResolvedTime, { kind: "resolved" }>;

/**
 * §3.3 "时间确认重叠": the two certain ranges intersect, or one side's possible
 * range lies entirely within the other side's certain range.
 */
export function confirmedOverlap(x: Resolved, y: Resolved): boolean {
  return intersects(x.certain, y.certain) || contains(y.certain, x.possible) || contains(x.certain, y.possible);
}

/** §3.3 / §3.2 "两个可能范围不相交". */
export function possiblyDisjoint(x: Resolved, y: Resolved): boolean {
  return !intersects(x.possible, y.possible);
}

/** Assumption strings for a fact whose resolved time a conclusion relied on. */
export function timeAssumptions(fact: Fact, t: Resolved): string[] {
  const out: string[] = [];
  if (t.vocabularyPeriod !== null) out.push(`vocab_period:${t.vocabularyPeriod}`);
  if (t.tolerance) out.push(`time_tolerance:${fact.id}`);
  return out;
}

export function dedupe(items: readonly string[]): string[] {
  return [...new Set(items)];
}
