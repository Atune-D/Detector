import { describe, expect, it } from "vitest";
import type { Category } from "../../src/engine";
import { isAnalyzeResponse } from "../../src/ui/api";
import {
  categoryLabel,
  deductionText,
  groupFindings,
  marksFor,
  quoteView,
  resultsOf,
  scoreDisplay,
  toFindings,
} from "../../src/ui/view";
import { buildSegments } from "../../src/ui/segments";
import { mockResponse, mockResults } from "./mockResponse";

const ALL: Category[] = ["direct", "inferential", "false_positive", "needs_review", "analysis_error"];

describe("groupFindings", () => {
  const groups = groupFindings(toFindings(mockResults));

  it("puts each category in its section", () => {
    expect(groups.contradictions.map((f) => f.result.category)).toEqual(["direct", "direct"]);
    expect(groups.needsReview.map((f) => f.result.category)).toEqual(["needs_review"]);
    expect(groups.dismissed.map((f) => f.result.category)).toEqual(["false_positive"]);
    expect(groups.errors.map((f) => f.result.category)).toEqual(["analysis_error"]);
  });

  it("sorts contradictions by score, highest first", () => {
    expect(groups.contradictions.map((f) => f.result.score)).toEqual([85, 75]);
  });

  it("keeps engine order for equal scores and keys by engine index", () => {
    const r = mockResults[3];
    if (!r) throw new Error("fixture");
    const twice = toFindings([{ ...r, score: 75, category: "inferential" }, { ...r, score: 85 }, { ...r, score: 75 }]);
    const g = groupFindings(twice);
    expect(g.contradictions.map((f) => f.key)).toEqual(["f1", "f0", "f2"]);
  });

  it("is empty for a failed run", () => {
    const g = groupFindings(toFindings(resultsOf({ status: "failed", reason: "malformed", detail: "x" })));
    expect(g).toEqual({ contradictions: [], needsReview: [], dismissed: [], errors: [] });
  });
});

describe("scoreDisplay", () => {
  it("shows a plain number for a scored contradiction", () => {
    expect(scoreDisplay({ category: "direct", score: 85 })).toEqual({ kind: "score", text: "85" });
    expect(scoreDisplay({ category: "inferential", score: 65 })).toEqual({ kind: "score", text: "65" });
    expect(scoreDisplay({ category: "direct", score: 85 }).text).not.toContain("%");
  });

  it("never renders an unscored result as 0", () => {
    for (const category of ALL) {
      const d = scoreDisplay({ category, score: null });
      expect(d.kind).toBe("status");
      expect(d.text).not.toMatch(/\d/);
      expect(d.text.length).toBeGreaterThan(0);
    }
  });

  it("does not show a number for a non-contradiction even if a score leaks through", () => {
    expect(scoreDisplay({ category: "needs_review", score: 0 })).toEqual({ kind: "status", text: "Needs review" });
    expect(scoreDisplay({ category: "false_positive", score: 0 })).toEqual({ kind: "status", text: "Dismissed" });
  });

  it("labels categories in English", () => {
    expect(categoryLabel("direct")).toBe("Direct contradiction");
    expect(categoryLabel("inferential")).toBe("Inferential contradiction");
    expect(categoryLabel("false_positive")).toBe("False positive");
    expect(categoryLabel("needs_review")).toBe("Needs review");
  });
});

describe("deductionText", () => {
  it("formats the marker sliced from its own offsets", () => {
    const r = mockResults[1];
    if (!r) throw new Error("fixture");
    expect(deductionText(r, mockResponse.transcripts)).toBe("−10: ‘I think’ in Transcript B");
  });

  it("is null without a deduction", () => {
    const r = mockResults[3];
    if (!r) throw new Error("fixture");
    expect(deductionText(r, mockResponse.transcripts)).toBeNull();
  });
});

describe("marksFor / quoteView", () => {
  const findings = toFindings(mockResults);

  it("builds marks from fact offsets with tone by category, and none for analysis errors", () => {
    const a = marksFor(findings, "A");
    expect(a.map((m) => [m.id, m.tone])).toEqual([
      ["f0", "review"],
      ["f1", "contradiction"],
      ["f2", "dismissed"],
      ["f3", "contradiction"],
    ]);
    for (const m of [...a, ...marksFor(findings, "B")]) {
      const r = findings.find((f) => f.key === m.id)?.result;
      const fact = r && [r.candidate.a, r.candidate.b].find((x) => x.source.start === m.start);
      expect(fact).toBeDefined();
    }
  });

  it("highlights exactly the quoted text in both transcripts", () => {
    const { A, B } = mockResponse.transcripts;
    const segA = buildSegments(A, marksFor(findings, "A")).filter((s) => s.marks.some((m) => m.id === "f3"));
    const segB = buildSegments(B, marksFor(findings, "B")).filter((s) => s.marks.some((m) => m.id === "f3"));
    expect(segA.map((s) => s.text).join("")).toBe("Around 10, maybe 10:30.");
    expect(segB.map((s) => s.text).join("")).toBe("Midnight maybe.");
  });

  it("falls back to the claimed quote when offsets are unusable", () => {
    const r = mockResults[0];
    if (!r) throw new Error("fixture");
    const broken = { ...r.candidate.a, source: { ...r.candidate.a.source, start: 9999, end: 10005 } };
    const q = quoteView(broken, mockResponse.transcripts);
    expect(q.located).toBe(false);
    expect(q.text).toBe(r.candidate.a.source.quote);
  });
});

describe("isAnalyzeResponse", () => {
  it("accepts the mock response and rejects malformed shapes", () => {
    expect(isAnalyzeResponse(mockResponse)).toBe(true);
    expect(isAnalyzeResponse({ ...mockResponse, mode: "other" })).toBe(false);
    expect(isAnalyzeResponse({ ...mockResponse, run: { status: "weird" } })).toBe(false);
    expect(isAnalyzeResponse({ ...mockResponse, run: { status: "failed", reason: "truncated", detail: "cut" } })).toBe(true);
    expect(isAnalyzeResponse(null)).toBe(false);
  });
});
