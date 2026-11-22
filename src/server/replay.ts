/**
 * Replay mode (spec §6.3): the bundled sample runs from a saved, hand-authored
 * extraction instead of calling the model, so the demo is deterministic. The saved
 * responses are fed through the same LlmClient interface, so they pass the same
 * schema validation and quote location as live responses.
 */
import type { AnalyzeRequest } from "@/contract";
import { SAMPLE_TRANSCRIPT_A, SAMPLE_TRANSCRIPT_B } from "@/sample/transcripts";
import saved from "@/sample/replay.json";
import type { LlmClient, LlmRawResponse, LlmRequest } from "./llm/client";

/** Trailing whitespace only; everything else must match exactly. */
const trimEnd = (s: string) => s.replace(/\s+$/u, "");

export function isSampleRequest(req: AnalyzeRequest): boolean {
  return trimEnd(req.transcriptA) === trimEnd(SAMPLE_TRANSCRIPT_A) && trimEnd(req.transcriptB) === trimEnd(SAMPLE_TRANSCRIPT_B);
}

export function replayClient(): LlmClient {
  return {
    async complete(req: LlmRequest): Promise<LlmRawResponse> {
      return { stopReason: "end_turn", text: JSON.stringify(saved[req.purpose]) };
    },
  };
}
