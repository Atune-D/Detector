import type { SampleResponse } from "@/contract";
import { SAMPLE_TRANSCRIPT_A, SAMPLE_TRANSCRIPT_B } from "@/sample/transcripts";

export const dynamic = "force-static";

export function GET(): Response {
  const body: SampleResponse = { transcriptA: SAMPLE_TRANSCRIPT_A, transcriptB: SAMPLE_TRANSCRIPT_B };
  return Response.json(body);
}
