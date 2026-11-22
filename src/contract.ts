import type { RunResult, Fact } from "@/engine";

export interface AnalyzeRequest {
  transcriptA: string;
  transcriptB: string;
}

export interface AnalyzeResponse {
  mode: "live" | "replay"; // replay = saved extraction for the bundled sample, no LLM call
  run: RunResult; // engine run result, unchanged
  transcripts: { A: string; B: string }; // the exact texts the offsets in `run` refer to
  facts: { A: Fact[]; B: Fact[] }; // extracted facts, for transparency in the UI
}

export interface SampleResponse {
  transcriptA: string;
  transcriptB: string;
}
