import { describe, expect, it } from "vitest";
import { locateQuote } from "../../src/engine";
import { SAMPLE_TRANSCRIPT_A, SAMPLE_TRANSCRIPT_B } from "../../src/sample/transcripts";
import { parseTranscript } from "../../src/server/transcript";

function roundTrips(text: string) {
  const p = parseTranscript(text);
  for (const qa of p.qa) {
    expect(text.slice(qa.questionStart, qa.questionEnd)).toBe(qa.question);
    expect(text.slice(qa.answerStart, qa.answerEnd)).toBe(qa.answer);
  }
  return p;
}

describe("parseTranscript", () => {
  it("splits the bundled sample into six Q/A pairs with stable ids and a header", () => {
    for (const text of [SAMPLE_TRANSCRIPT_A, SAMPLE_TRANSCRIPT_B]) {
      const p = roundTrips(text);
      expect(p.qa.map((q) => q.id)).toEqual(["Q1", "Q2", "Q3", "Q4", "Q5", "Q6"]);
      expect(p.header).toMatch(/^Deposition of Marcus Webb — /);
    }
    const a = parseTranscript(SAMPLE_TRANSCRIPT_A);
    expect(a.qa[0]?.question).toBe("Where were you on the evening of November 3rd?");
    expect(a.qa[0]?.answer).toBe("I was at home all evening. I ordered pizza around 7pm and watched TV.");
    expect(a.qa[5]?.answer).toBe("No. I'd never heard of him before this whole thing started.");
  });

  it("is deterministic: same text, same ids and offsets", () => {
    expect(parseTranscript(SAMPLE_TRANSCRIPT_B)).toEqual(parseTranscript(SAMPLE_TRANSCRIPT_B));
  });

  it("keeps exact UTF-16 offsets through an emoji, accents and a repeated sentence", () => {
    const text = [
      "Deposition of José Ñúñez 🙂 — 2023",
      "",
      "Q: Did you see the car? 🚗",
      "A: Yes. I saw it. 😬 I saw it.",
      "",
      "Q. And after that?",
      "A. I saw it.",
    ].join("\n");
    const p = roundTrips(text);
    expect(p.qa).toHaveLength(2);
    const [q1, q2] = p.qa;
    expect(q1?.question).toBe("Did you see the car? 🚗");
    expect(q1?.answer).toBe("Yes. I saw it. 😬 I saw it.");
    expect(q2?.question).toBe("And after that?");
    expect(q2?.answer).toBe("I saw it.");
    // The repeated sentence occurs three times; each answer still slices back exactly.
    const hits = locateQuote(text, "I saw it.");
    expect(hits).toHaveLength(3);
    for (const at of hits) expect(text.slice(at, at + "I saw it.".length)).toBe("I saw it.");
    // The emoji is two UTF-16 code units; offsets are code units, not code points.
    expect(q1 && text.slice(q1.answerEnd - 9, q1.answerEnd)).toBe("I saw it.");
    expect(q2 && q2.answerStart > (q1?.answerEnd ?? 0)).toBe(true);
  });

  it("tolerates blank lines, CRLF, no header and multi-line answers without normalising text", () => {
    const text = "Q: Where were you?\r\nA: At home.\r\nI stayed in.\r\n\r\n   continued after a blank line\r\n\r\n\r\nQ:   What then?\r\nA:\r\n  Nothing.  \r\n";
    const p = roundTrips(text);
    expect(p.header).toBe("");
    expect(p.qa).toHaveLength(2);
    expect(p.qa[0]?.question).toBe("Where were you?");
    expect(p.qa[0]?.answer).toBe("At home.\r\nI stayed in.\r\n\r\n   continued after a blank line");
    expect(p.qa[1]?.question).toBe("What then?");
    expect(p.qa[1]?.answer).toBe("Nothing.");
  });

  it("handles a question without an answer and an answer without a question", () => {
    const text = "Header\nA: Stray answer.\nQ: Unanswered?\nQ: Answered?\nA: Yes.";
    const p = roundTrips(text);
    expect(p.qa.map((q) => [q.question, q.answer])).toEqual([
      ["", "Stray answer."],
      ["Unanswered?", ""],
      ["Answered?", "Yes."],
    ]);
  });
});
