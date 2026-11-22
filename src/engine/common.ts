import { resolveTime, type ResolvedTime } from "./time";
import { MISSING } from "./rules";
import type { CompareResult, Entity, EvidenceRef, Fact } from "./types";
import type { Policy } from "./config";

export function evidenceRef(f: Fact): EvidenceRef {
  return {
    factId: f.id,
    transcript: f.source.transcript,
    qaId: f.source.qaId,
    quote: f.source.quote,
    start: f.source.start,
    end: f.source.end,
  };
}

export function makeResult(
  result: CompareResult["result"],
  ruleId: string,
  facts: readonly Fact[],
  missingConditions: readonly string[] = [],
  assumptions: readonly string[] = [],
): CompareResult {
  return {
    result,
    ruleId,
    evidenceRefs: facts.map(evidenceRef),
    // missingConditions are only meaningful for unknown; assumptions only for a conclusion.
    missingConditions: result === "unknown" ? [...new Set(missingConditions)] : [],
    assumptions: result === "unknown" ? [] : [...new Set(assumptions)],
  };
}

export type EntityRelation = "same" | "x_within_y" | "y_within_x" | "unresolved";

/** Relation between two entities using only ids and declared `partOf` chains. */
export function entityRelation(x: Entity | undefined, y: Entity | undefined): EntityRelation {
  if (x === undefined && y === undefined) return "same"; // predicate carries no object on either side
  if (x === undefined || y === undefined) return "unresolved";
  if (x.id === y.id) return "same";
  if (x.partOf?.includes(y.id)) return "x_within_y";
  if (y.partOf?.includes(x.id)) return "y_within_x";
  return "unresolved";
}

export type Resolved = Extract<ResolvedTime, { kind: "resolved" }>;

/** Resolve a fact's time, pushing a missing-condition code when it cannot be used. */
export function resolveFactTime(f: Fact, policy: Policy, missing: string[]): Resolved | null {
  const t = resolveTime(f.time, policy);
  if (t.kind === "resolved") return t;
  missing.push(t.kind === "unanchored" ? `${MISSING.timeNotAnchored}:${f.id}` : `${MISSING.timeUnparseable}:${f.id}`);
  return null;
}

export function normalizeQuestion(q: string): string {
  return q.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
