/** A scripted LLM client for pipeline tests. Never touches the network. */
import { LlmTransportError, type LlmClient, type LlmPurpose, type LlmRawResponse, type LlmRequest } from "../../src/server/llm/client";

export type Script = LlmRawResponse | LlmTransportError | Error;

export class FakeLlm implements LlmClient {
  readonly requests: LlmRequest[] = [];
  constructor(private readonly script: Partial<Record<LlmPurpose, Script>>) {}

  async complete(req: LlmRequest): Promise<LlmRawResponse> {
    this.requests.push(req);
    const s = this.script[req.purpose];
    if (s === undefined) throw new Error(`FakeLlm: no script for ${req.purpose}`);
    if (s instanceof Error) throw s;
    return s;
  }
}

export const ok = (value: unknown): LlmRawResponse => ({ stopReason: "end_turn", text: JSON.stringify(value) });

type Json = { [key: string]: unknown };

/** A schema-valid extracted fact with sensible defaults. */
export function xfact(qaId: string, quote: string, action: string, time: Json, extra: Json = {}): Json {
  return {
    qaId,
    quote,
    person: "witness",
    action,
    object: null,
    location: null,
    time,
    polarity: "affirmative",
    negationForm: null,
    stateSource: { kind: "explicit" },
    uncertaintyMarkers: [],
    occurrence: null,
    ...extra,
  };
}

export const evening = (date: string, original = "all evening"): Json => ({ kind: "period", original, date, period: "evening" });
export const instant = (date: string, clock: string, original: string, markers: { text: string; class: string }[] = []): Json => ({
  kind: "instant",
  original,
  date,
  from: clock,
  to: clock,
  markers,
});
