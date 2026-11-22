/**
 * Live extraction check (spec §6.3 "真实调用 LLM"): runs the real API on the bundled
 * sample and prints the outcomes. It does NOT assert exact scores — live extraction
 * may vary; compare with the replay results to see whether a difference comes from
 * extraction. Not part of `npm test`; run with `npm run test:live`. Skips when
 * ANTHROPIC_API_KEY is not set.
 */
import { describe, expect, it } from "vitest";
import { SAMPLE_TRANSCRIPT_A, SAMPLE_TRANSCRIPT_B } from "../src/sample/transcripts";
import { llmClientFromEnv } from "../src/server/llm/client";
import { runPipeline } from "../src/server/pipeline";
import { isSampleRequest } from "../src/server/replay";

const llm = llmClientFromEnv();

describe.skipIf(llm === null)("live extraction on the bundled sample", () => {
  it("runs the full pipeline against the real API", { timeout: 900_000 }, async () => {
    // Append one extra Q/A so the request is NOT treated as the sample (forces a live call)
    // while every quote in the transcript text stays identical.
    const transcriptB = `${SAMPLE_TRANSCRIPT_B}\nQ: Is there anything else?\nA: No.\n`;
    expect(isSampleRequest({ transcriptA: SAMPLE_TRANSCRIPT_A, transcriptB })).toBe(false);
    const res = await runPipeline({ transcriptA: SAMPLE_TRANSCRIPT_A, transcriptB }, { llm });
    expect(res.mode).toBe("live");
    console.log(`run status: ${res.run.status}`);
    console.log(`facts: A=${res.facts.A.length} B=${res.facts.B.length}`);
    for (const f of [...res.facts.A, ...res.facts.B]) {
      console.log(`  ${f.id} ${f.source.qaId} ${f.action} ${f.polarity} [${f.source.start},${f.source.end}) "${f.source.quote}"`);
    }
    if (res.run.status === "failed") {
      console.log(`failed: ${res.run.reason} — ${res.run.detail}`);
      return;
    }
    for (const r of res.run.results) {
      console.log(
        `${r.category.padEnd(15)} ${String(r.score ?? "-").padEnd(3)} ${r.candidate.kind.padEnd(10)} "${r.candidate.a.source.quote}"  vs  "${r.candidate.b.source.quote}"` +
          (r.compare?.missingConditions.length ? `  missing=${r.compare.missingConditions.join(",")}` : "") +
          (r.errors.length ? `  errors=${r.errors.map((e) => e.detail).join(";")}` : ""),
      );
    }
  });
});
