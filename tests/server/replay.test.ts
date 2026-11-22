/**
 * Replay end-to-end (spec §6.3): the real sample through the route handlers,
 * using the saved extraction. Exact categories and scores per §6.2 row.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { POST } from "../../app/api/analyze/route";
import { GET } from "../../app/api/sample/route";
import type { AnalyzeResponse, SampleResponse } from "../../src/contract";
import type { CandidateResult } from "../../src/engine";
import { SAMPLE_TRANSCRIPT_A, SAMPLE_TRANSCRIPT_B } from "../../src/sample/transcripts";
import { runPipeline } from "../../src/server/pipeline";
import { isSampleRequest } from "../../src/server/replay";

async function analyze(transcriptA: string, transcriptB: string): Promise<AnalyzeResponse> {
  const res = await POST(new Request("http://localhost/api/analyze", { method: "POST", body: JSON.stringify({ transcriptA, transcriptB }) }));
  expect(res.status).toBe(200);
  return (await res.json()) as AnalyzeResponse;
}

function find(results: CandidateResult[], quoteA: string, quoteB: string): CandidateResult {
  const r = results.filter((x) => x.candidate.a.source.quote.includes(quoteA) && x.candidate.b.source.quote.includes(quoteB));
  if (r.length !== 1) throw new Error(`expected one candidate for "${quoteA}" / "${quoteB}", got ${r.length}`);
  return r[0] as CandidateResult;
}

describe("GET /api/sample", () => {
  it("returns the brief's transcripts verbatim", async () => {
    const body = (await GET().json()) as SampleResponse;
    expect(body).toEqual({ transcriptA: SAMPLE_TRANSCRIPT_A, transcriptB: SAMPLE_TRANSCRIPT_B });
    expect(body.transcriptA).toContain("A: No, never. I don't even know where that is.");
    expect(body.transcriptB).toContain("A: I knew of him. We had mutual friends. I don't think I'd met him face to face.");
  });
});

describe("replay of the bundled sample through POST /api/analyze", () => {
  let body: AnalyzeResponse;
  let results: CandidateResult[] = [];
  beforeAll(async () => {
    body = await analyze(SAMPLE_TRANSCRIPT_A, SAMPLE_TRANSCRIPT_B);
    results = body.run.status === "completed" ? body.run.results : [];
  });

  it("runs in replay mode, completes, and echoes the exact transcripts", () => {
    expect(body.mode).toBe("replay");
    expect(body.run.status).toBe("completed");
    expect(body.transcripts).toEqual({ A: SAMPLE_TRANSCRIPT_A, B: SAMPLE_TRANSCRIPT_B });
    expect(body.facts.A).toHaveLength(8);
    expect(body.facts.B).toHaveLength(10);
  });

  it("every fact quote and marker offset round-trips against the returned transcripts", () => {
    for (const f of [...body.facts.A, ...body.facts.B]) {
      const text = body.transcripts[f.source.transcript];
      expect(text.slice(f.source.start, f.source.end)).toBe(f.source.quote);
      for (const m of f.uncertaintyMarkers) expect(text.slice(m.span.start, m.span.end)).toBe(m.text);
    }
  });

  it('"at home all evening" vs "I think I went out briefly … maybe around 7:30" -> direct 75', () => {
    const r = find(results, "I was at home all evening", "I think I went out briefly");
    expect(r.candidate.b.action).toBe("location.out");
    expect([r.category, r.score]).toEqual(["direct", 75]);
    expect(r.compare?.ruleId).toBe("R_STATE");
    expect(r.compare?.assumptions).toEqual(["vocab_period:evening", `time_tolerance:${r.candidate.b.id}`]);
    expect(r.record?.deduction).toMatchObject({ markerText: "I think", transcript: "B", amount: 10 });
    const d = r.record?.deduction;
    expect(d && SAMPLE_TRANSCRIPT_B.slice(d.start, d.end)).toBe("I think");
  });

  it('"ordered pizza around 7pm" vs "get some groceries" -> false positive', () => {
    const r = find(results, "I ordered pizza around 7pm", "groceries");
    expect(r.candidate.b.action).toBe("activity.bought_groceries");
    expect([r.category, r.score]).toEqual(["false_positive", null]);
  });

  it('"Around 10, maybe 10:30" vs "Midnight maybe" -> direct 85 (same question + same night, tolerance)', () => {
    const r = find(results, "Around 10, maybe 10:30", "Midnight maybe");
    expect([r.category, r.score]).toEqual(["direct", 85]);
    expect(r.compare?.ruleId).toBe("R_EVENT_TIME");
    expect(r.compare?.assumptions).toEqual([
      "same_event:same_question_same_date",
      `time_tolerance:${r.candidate.a.id}`,
      `time_tolerance:${r.candidate.b.id}`,
    ]);
    expect(r.record?.deduction).toBeNull();
  });

  it('"No, I was alone" vs "Tom might have seen me. We waved or something" -> needs review', () => {
    const r = find(results, "No, I was alone", "might have seen me");
    expect([r.category, r.score]).toEqual(["needs_review", null]);
    expect(r.compare?.ruleId).toBe("R_TEMPLATE_ALONE_VS_COPRESENT");
    expect(r.compare?.missingConditions).toEqual(["copresence_not_established:activity.waved", "space_scope_unconfirmed"]);
  });

  it("never been to the Hargrove Street warehouse vs driven through that part of town -> false positive", () => {
    const r = find(results, "No, never.", "I've driven through that part of town");
    expect([r.category, r.score]).toEqual(["false_positive", null]);
    expect(r.compare?.ruleId).toBe("R_NEGATION");
  });

  it('"I\'d never heard of him before this whole thing started" vs "I knew of him" -> needs review (time not anchored)', () => {
    const r = find(results, "I'd never heard of him", "I knew of him");
    expect([r.category, r.score]).toEqual(["needs_review", null]);
    expect(r.compare?.missingConditions).toContain(`time_not_anchored:${r.candidate.b.id}`);
  });

  it('"Had you met…? No." vs "I don\'t think I\'d met him face to face" -> needs review (polarity undetermined)', () => {
    const r = find(results, "No.", "I don't think I'd met him face to face");
    expect([r.category, r.score]).toEqual(["needs_review", null]);
    expect(r.compare?.missingConditions).toEqual([`polarity_undetermined:${r.candidate.b.id}`]);
  });

  it("one extra row from the real wording: at home all evening vs in the parking lot -> needs review", () => {
    const r = find(results, "I was at home all evening", "We waved or something in the parking lot");
    expect(r.candidate.b.action).toBe("location.place");
    expect([r.category, r.score]).toEqual(["needs_review", null]);
    expect(r.compare?.missingConditions).toEqual(["location_relation_unknown:location.home/location.place(parking_lot)"]);
  });

  it("produces exactly these eight findings", () => {
    expect(results).toHaveLength(8);
  });

  it("is deterministic", async () => {
    expect(await analyze(SAMPLE_TRANSCRIPT_A, SAMPLE_TRANSCRIPT_B)).toEqual(body);
  });
});

describe("sample detection", () => {
  it("ignores trailing whitespace only", async () => {
    expect(isSampleRequest({ transcriptA: `${SAMPLE_TRANSCRIPT_A}\n\n  `, transcriptB: SAMPLE_TRANSCRIPT_B.trimEnd() })).toBe(true);
    const res = await runPipeline({ transcriptA: `${SAMPLE_TRANSCRIPT_A}\n\n  `, transcriptB: SAMPLE_TRANSCRIPT_B }, { llm: null });
    expect(res.mode).toBe("replay");
    expect(res.run.status).toBe("completed");
  });

  it("any other change is live input: with no key it fails with the key message", async () => {
    expect(isSampleRequest({ transcriptA: ` ${SAMPLE_TRANSCRIPT_A}`, transcriptB: SAMPLE_TRANSCRIPT_B })).toBe(false);
    const edited = SAMPLE_TRANSCRIPT_B.replace("Midnight maybe.", "Midnight, maybe.");
    const res = await runPipeline({ transcriptA: SAMPLE_TRANSCRIPT_A, transcriptB: edited }, { llm: null });
    expect(res.mode).toBe("live");
    expect(res.run).toMatchObject({ status: "failed", reason: "upstream_missing" });
    expect(res.run.status === "failed" && res.run.detail).toContain("ANTHROPIC_API_KEY");
  });
});
