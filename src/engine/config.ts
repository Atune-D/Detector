/**
 * All tunables in one versioned object (spec §3.2 "精度策略（版本化配置）", §4
 * "数字是版本化的初始参数"). Initial values are NOT calibrated against data.
 * Changing any value must bump `version`.
 */
export const POLICY = {
  version: "policy-v1",

  /** §3.2 — widening of an instant's possible range, in minutes, per marker class. Widest marker wins; no stacking. */
  instantWidening: {
    exact: 0,
    unmarked: 5,
    approx: 20,
    hedge: 30,
  },

  /**
   * §3.3 — shrink (certain range) / widen (possible range) of a duration bound, in minutes.
   * A bound given as a plain clock time is testimony-supported: certain = possible.
   * A bound with a fuzzy word moves "同 §3.2".
   */
  boundWidening: {
    exact: 0,
    unmarked: 0,
    approx: 20,
    hedge: 30,
  },

  /** §3.3 — vocabulary periods, minutes from 00:00 of the referenced date. Policy-derived, never "confirmed by the text". */
  vocabularyPeriods: {
    evening: {
      certain: { start: 18 * 60, end: 21 * 60 },
      possible: { start: 17 * 60, end: 24 * 60 },
    },
  } as Readonly<Record<string, { certain: { start: number; end: number }; possible: { start: number; end: number } }>>,

  /** §4 */
  scoring: {
    direct: 85,
    inferential: 75,
    uncertaintyDeduction: 10,
  },
} as const;

export type Policy = typeof POLICY;
