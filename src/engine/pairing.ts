/**
 * §2 pairing. Candidates come from two sources — the program's pairing table and
 * AI nominations — merged and de-duplicated. Pairing only decides WHETHER to
 * compare; comparators re-check everything.
 *
 * Program pairing requires a concrete conflict reason (no reason -> no candidate):
 * - negation:   same person, same predicate, differing polarity (affirmative / negative / undetermined)
 * - event_time: same person, same event predicate, both affirmative instants on the same date
 * - state:      same person, both explicit affirmative states/activities, and either a registered
 *               "exclusive" entry or the same state dimension with a different value
 * - template:   same person, one explicit "alone" claim, the other resting on an activity that
 *               implies actual co-presence (derived facts go here, never to state)
 */
import { underlyingActivity } from "./comparators/template";
import { COPRESENCE_ACTIVITIES, RULE_IDS, lookupStateRelation } from "./rules";
import { PREDICATE_KINDS, type Candidate, type CandidateOrigin, type CompareKind, type Fact, type Nomination } from "./types";

export function candidateId(kind: CompareKind, templateId: string | null | undefined, a: Fact, b: Fact): string {
  return `${kind}|${templateId ?? "-"}|${a.id}|${b.id}`;
}

function isStateLike(f: Fact): boolean {
  const k = PREDICATE_KINDS[f.action];
  return k === "state" || k === "activity";
}

function dimension(f: Fact): string | null {
  return PREDICATE_KINDS[f.action] === "state" ? (f.action.split(".")[0] ?? null) : null;
}

function isExplicitAffirmative(f: Fact): boolean {
  return f.polarity === "affirmative" && f.stateSource.kind === "explicit";
}

function isAloneClaim(f: Fact): boolean {
  return f.action === "company.alone" && isExplicitAffirmative(f);
}

function impliesCopresence(f: Fact): boolean {
  return f.polarity === "affirmative" && COPRESENCE_ACTIVITIES.includes(underlyingActivity(f).predicate);
}

/** Program-pairing kinds for one (A, B) fact pair, per the §2 table. */
export function programKinds(a: Fact, b: Fact): { kind: CompareKind; templateId: string | null }[] {
  if (a.person !== b.person) return [];
  const out: { kind: CompareKind; templateId: string | null }[] = [];

  // Differing polarity (incl. one side undetermined) is the conflict reason; equal polarity is none.
  if (a.action === b.action && a.polarity !== b.polarity) {
    out.push({ kind: "negation", templateId: null });
  }

  if (
    a.action === b.action &&
    PREDICATE_KINDS[a.action] === "event" &&
    a.polarity === "affirmative" &&
    b.polarity === "affirmative" &&
    a.time.kind === "instant" &&
    b.time.kind === "instant" &&
    a.time.date === b.time.date
  ) {
    out.push({ kind: "event_time", templateId: null });
  }

  if (isStateLike(a) && isStateLike(b) && isExplicitAffirmative(a) && isExplicitAffirmative(b)) {
    const entry = lookupStateRelation(a.action, b.action);
    const dimA = dimension(a);
    const sameDimDifferentValue = dimA !== null && dimA === dimension(b) && a.action !== b.action;
    if (entry?.relation === "exclusive" || (entry === null && sameDimDifferentValue)) {
      out.push({ kind: "state", templateId: null });
    }
  }

  if ((isAloneClaim(a) && impliesCopresence(b)) || (isAloneClaim(b) && impliesCopresence(a))) {
    out.push({ kind: "template", templateId: RULE_IDS.aloneVsCopresent });
  }
  return out;
}

export interface RejectedNomination {
  nomination: Nomination;
  reason: string;
}

export interface PairingResult {
  candidates: Candidate[];
  rejectedNominations: RejectedNomination[];
}

export function buildCandidates(
  factsA: readonly Fact[],
  factsB: readonly Fact[],
  nominations: readonly Nomination[] = [],
): PairingResult {
  const byId = new Map<string, { kind: CompareKind; templateId: string | null; a: Fact; b: Fact; origins: Set<CandidateOrigin>; reasons: string[] }>();
  const add = (kind: CompareKind, templateId: string | null, a: Fact, b: Fact, origin: CandidateOrigin, reason: string | null) => {
    const id = candidateId(kind, templateId, a, b);
    let entry = byId.get(id);
    if (!entry) {
      entry = { kind, templateId, a, b, origins: new Set(), reasons: [] };
      byId.set(id, entry);
    }
    entry.origins.add(origin);
    if (reason !== null && !entry.reasons.includes(reason)) entry.reasons.push(reason);
  };

  for (const a of factsA) {
    for (const b of factsB) {
      for (const k of programKinds(a, b)) add(k.kind, k.templateId, a, b, "program", null);
    }
  }

  const aIndex = new Map(factsA.map((f) => [f.id, f]));
  const bIndex = new Map(factsB.map((f) => [f.id, f]));
  const rejectedNominations: RejectedNomination[] = [];
  for (const n of nominations) {
    // Accept either orientation, but the pair must be one fact from each transcript.
    const a = aIndex.get(n.factIdA) ?? aIndex.get(n.factIdB);
    const b = bIndex.get(n.factIdB) ?? bIndex.get(n.factIdA);
    if (!a || !b) {
      rejectedNominations.push({ nomination: n, reason: "fact ids do not name one fact from each transcript" });
      continue;
    }
    add(n.kind, n.kind === "template" ? (n.templateId ?? null) : null, a, b, "nomination", n.reason);
  }

  const candidates: Candidate[] = [...byId.entries()]
    .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
    .map(([id, e]) => ({
      id,
      a: e.a,
      b: e.b,
      kind: e.kind,
      templateId: e.kind === "template" ? e.templateId : undefined,
      origins: (["program", "nomination"] as const).filter((o) => e.origins.has(o)),
      reasons: e.reasons,
    }));
  return { candidates, rejectedNominations };
}
