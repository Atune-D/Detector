/**
 * §3.4 Fixed inference templates. V1 ships exactly one: R_TEMPLATE_ALONE_VS_COPRESENT.
 * A template returns `conflict` only when every slot is established, otherwise
 * `unknown`. It never returns `compatible`.
 */
import { POLICY, type Policy } from "../config";
import { makeResult, resolveFactTime } from "../common";
import { confirmedOverlap, isEmpty, timeAssumptions } from "../time";
import { COPRESENCE_ACTIVITIES, MISSING, RULE_IDS } from "../rules";
import type { Activity, CompareResult, Fact } from "../types";

const RULE = RULE_IDS.aloneVsCopresent;

/** The activity a fact rests on: the retained activity of a derived state, or the fact's own activity. */
export function underlyingActivity(f: Fact): Activity {
  if (f.stateSource.kind === "derived") return f.stateSource.activity;
  const a: Activity = { predicate: f.action, text: f.source.quote };
  if (f.object?.granularity === "person") a.counterpart = f.object.id;
  return a;
}

export function compareAloneVsCopresent(x: Fact, y: Fact, policy: Policy = POLICY): CompareResult {
  const facts = [x, y];
  const unknown = (missing: string[]) => makeResult("unknown", RULE, facts, missing);

  // Role assignment: exactly one side must be the "alone" claim.
  const xAlone = x.action === "company.alone";
  const yAlone = y.action === "company.alone";
  if (xAlone === yAlone) return unknown([`${MISSING.aloneClaimNotEstablished}:shape`]);
  const alone = xAlone ? x : y;
  const co = xAlone ? y : x;

  // Slot 1: same person.
  if (alone.person !== co.person) return unknown([MISSING.personMismatch]);

  const missing: string[] = [];

  // Slot 2: A explicitly says they were alone throughout a period, within a spatial scope.
  if (alone.polarity !== "affirmative") missing.push(`${MISSING.aloneClaimNotEstablished}:polarity`);
  if (alone.stateSource.kind !== "explicit") missing.push(`${MISSING.aloneClaimNotEstablished}:state_source`);
  if (!alone.location) missing.push(`${MISSING.aloneClaimNotEstablished}:no_space_scope`);
  const tAlone = resolveFactTime(alone, policy, missing);
  if (tAlone && isEmpty(tAlone.certain)) missing.push(`${MISSING.aloneClaimNotEstablished}:no_certain_period`);

  // Slot 3: B's activity means another person was ACTUALLY co-present.
  const activity = underlyingActivity(co);
  const actuallyCopresent =
    co.polarity === "affirmative" &&
    COPRESENCE_ACTIVITIES.includes(activity.predicate) &&
    activity.counterpart !== undefined &&
    activity.counterpart !== co.person &&
    !co.uncertaintyMarkers.some((m) => m.modifies === "others_action");
  if (!actuallyCopresent) missing.push(`${MISSING.copresenceNotEstablished}:${activity.predicate}`);

  // Slot 4: co-presence confirmed inside A's period (same standard as §3.3).
  const tCo = resolveFactTime(co, policy, missing);
  if (tAlone && tCo && !confirmedOverlap(tAlone, tCo)) missing.push(MISSING.copresenceTimeUnconfirmed);

  // Slot 5: co-presence happened inside A's spatial scope.
  const scope = alone.location;
  const place = co.location;
  const inScope = scope !== undefined && place !== undefined && (place.id === scope.id || (place.partOf?.includes(scope.id) ?? false));
  if (!inScope) missing.push(MISSING.spaceScopeUnconfirmed);

  if (missing.length > 0 || !tAlone || !tCo) return unknown(missing);
  return makeResult("conflict", RULE, facts, [], [...timeAssumptions(x, x === alone ? tAlone : tCo), ...timeAssumptions(y, y === alone ? tAlone : tCo)]);
}

/** Entry point for kind "template": routes by template id; unimplemented -> unknown (needs review). */
export function compareTemplate(templateId: string | null | undefined, a: Fact, b: Fact, policy: Policy = POLICY): CompareResult {
  if (templateId === RULE_IDS.aloneVsCopresent) return compareAloneVsCopresent(a, b, policy);
  return makeResult("unknown", RULE_IDS.noTemplate, [a, b], [`${MISSING.templateNotImplemented}:${templateId ?? "none"}`]);
}
