import { describe, expect, it } from "vitest";
import { analyzeRun, buildCandidates, failedRun, locateQuote, validateQuote } from "../src/engine";
import * as M from "./fixtures/marcusWebb";

describe("quote validation", () => {
  const text = "Q: Where?\nA: I was at home all evening.\n";

  it("accepts a quote found exactly at its offsets", () => {
    const start = text.indexOf("at home");
    expect(validateQuote(text, "at home", start, start + 7)).toEqual({ ok: true });
  });

  it("rejects wrong offsets, out-of-range offsets, empty and absent quotes", () => {
    expect(validateQuote(text, "at home", 0, 7).ok).toBe(false);
    expect(validateQuote(text, "at home", -1, 6).ok).toBe(false);
    expect(validateQuote(text, "at home", text.length - 2, text.length + 5).ok).toBe(false);
    expect(validateQuote(text, "", 3, 3).ok).toBe(false);
    expect(validateQuote(text, "at the office", 13, 26).ok).toBe(false);
    expect(validateQuote(text, "at home", 1.5, 8.5).ok).toBe(false);
  });

  it("offsets are UTF-16 code units (astral characters count as two)", () => {
    const t = "A: 🙂 I was home.";
    const start = t.indexOf("I was");
    expect(start).toBe(6);
    expect(validateQuote(t, "I was home", start, start + 10)).toEqual({ ok: true });
  });

  it("locateQuote returns every occurrence", () => {
    expect(locateQuote("no, no, no", "no")).toEqual([0, 4, 8]);
    expect(locateQuote("abc", "x")).toEqual([]);
    expect(locateQuote("abc", "")).toEqual([]);
  });
});

describe("run-level result (§5)", () => {
  it("failed upstream -> failed status", () => {
    expect(failedRun("truncated", "response cut at 4096 tokens")).toEqual({
      status: "failed",
      reason: "truncated",
      detail: "response cut at 4096 tokens",
    });
  });

  it("nominations naming facts that do not exist are rejected, not analysed", () => {
    const r = buildCandidates(M.marchFacts, M.septemberFacts, [{ factIdA: "nope", factIdB: "S1-out", kind: "state", reason: "x" }]);
    expect(r.rejectedNominations).toHaveLength(1);
  });

  it("program pairing and nomination of the same pair+kind merge into one candidate", () => {
    const r = buildCandidates([M.mHomeAllEvening], [M.sWentOut], [{ factIdA: "M1-home", factIdB: "S1-out", kind: "state", reason: "home vs out" }]);
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0]?.origins).toEqual(["program", "nomination"]);
    expect(r.candidates[0]?.reasons).toEqual(["home vs out"]);
  });
});

describe("determinism", () => {
  it("same input twice -> deep-equal output", () => {
    const once = () => {
      const { candidates } = buildCandidates(structuredClone(M.marchFacts), structuredClone(M.septemberFacts), structuredClone(M.nominations));
      return analyzeRun(candidates, { ...M.transcripts });
    };
    const first = once();
    const second = once();
    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("candidate order does not depend on input fact order", () => {
    const ids = (a: typeof M.marchFacts, b: typeof M.septemberFacts) => buildCandidates(a, b, M.nominations).candidates.map((c) => c.id);
    expect(ids([...M.marchFacts].reverse(), [...M.septemberFacts].reverse())).toEqual(ids(M.marchFacts, M.septemberFacts));
  });
});
