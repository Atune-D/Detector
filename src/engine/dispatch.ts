/**
 * §2 dispatcher: each candidate goes ONLY to the comparator of its own compare kind.
 * Comparators re-check comparability themselves; being nominated skips nothing.
 */
import { POLICY, type Policy } from "./config";
import { makeResult } from "./common";
import { compareNegation } from "./comparators/negation";
import { compareEventTime } from "./comparators/eventTime";
import { compareState } from "./comparators/state";
import { compareTemplate } from "./comparators/template";
import { MISSING, RULE_IDS } from "./rules";
import type { Candidate, CompareResult } from "./types";

export function ruleIdForKind(c: Pick<Candidate, "kind" | "templateId">): string {
  switch (c.kind) {
    case "negation":
      return RULE_IDS.negation;
    case "event_time":
      return RULE_IDS.eventTime;
    case "state":
      return RULE_IDS.state;
    case "template":
      return c.templateId === RULE_IDS.aloneVsCopresent ? RULE_IDS.aloneVsCopresent : RULE_IDS.noTemplate;
  }
}

export function compareCandidate(c: Candidate, policy: Policy = POLICY): CompareResult {
  // A candidate is one fact from each transcript.
  if (c.a.source.transcript !== "A" || c.b.source.transcript !== "B") {
    return makeResult("unknown", ruleIdForKind(c), [c.a, c.b], [MISSING.notCrossTranscript]);
  }
  switch (c.kind) {
    case "negation":
      return compareNegation(c.a, c.b, policy);
    case "event_time":
      return compareEventTime(c.a, c.b, policy);
    case "state":
      return compareState(c.a, c.b, policy);
    case "template":
      return compareTemplate(c.templateId, c.a, c.b, policy);
  }
}
