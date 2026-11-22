import { describe, expect, it } from "vitest";
import { buildSegments, isValidRange, segmentTone, sliceRange, type Mark, type Segment } from "../../src/ui/segments";

const join = (segs: Segment[]) => segs.map((s) => s.text).join("");
const ids = (s: Segment | undefined) => (s ? s.marks.map((m) => m.id) : []);
const mark = (id: string, start: number, end: number, tone: Mark["tone"] = "contradiction"): Mark => ({ id, start, end, tone });

describe("buildSegments", () => {
  it("returns no segments for empty text", () => {
    expect(buildSegments("", [mark("x", 0, 3)])).toEqual([]);
  });

  it("returns one plain segment without marks", () => {
    expect(buildSegments("hello", [])).toEqual([{ start: 0, end: 5, text: "hello", marks: [] }]);
  });

  it("slices on offsets, not on quote text", () => {
    // "at home" occurs twice; only the second occurrence is marked.
    const text = "at home, then at home";
    const segs = buildSegments(text, [mark("x", 14, 21)]);
    expect(segs.map((s) => [s.text, ids(s)])).toEqual([
      ["at home, then ", []],
      ["at home", ["x"]],
    ]);
  });

  it("splits overlapping ranges and lists every covering mark", () => {
    const text = "0123456789";
    const segs = buildSegments(text, [mark("a", 2, 6), mark("b", 4, 8, "review")]);
    expect(segs.map((s) => [s.text, ids(s)])).toEqual([
      ["01", []],
      ["23", ["a"]],
      ["45", ["a", "b"]],
      ["67", ["b"]],
      ["89", []],
    ]);
    expect(join(segs)).toBe(text);
  });

  it("orders covering marks by tone strength, so the strongest tone wins", () => {
    const segs = buildSegments("abcdef", [mark("fp", 0, 6, "dismissed"), mark("rv", 1, 5, "review"), mark("c", 2, 4)]);
    const middle = segs.find((s) => s.start === 2);
    expect(ids(middle)).toEqual(["c", "rv", "fp"]);
    expect(middle && segmentTone(middle)).toBe("contradiction");
  });

  it("keeps adjacent ranges as separate segments", () => {
    const segs = buildSegments("aaabbb", [mark("a", 0, 3), mark("b", 3, 6)]);
    expect(segs.map((s) => [s.text, ids(s)])).toEqual([
      ["aaa", ["a"]],
      ["bbb", ["b"]],
    ]);
  });

  it("handles identical and nested ranges", () => {
    const segs = buildSegments("abcdef", [mark("x", 1, 5), mark("y", 1, 5), mark("z", 2, 3)]);
    expect(segs.map((s) => [s.text, ids(s)])).toEqual([
      ["a", []],
      ["b", ["x", "y"]],
      ["c", ["x", "y", "z"]],
      ["de", ["x", "y"]],
      ["f", []],
    ]);
  });

  it("ignores out-of-bounds, inverted, empty and non-integer ranges without crashing", () => {
    const text = "short";
    const bad = [mark("neg", -1, 2), mark("past", 3, 99), mark("inv", 4, 2), mark("empty", 2, 2), mark("frac", 1.5, 3), mark("nan", Number.NaN, 3)];
    const segs = buildSegments(text, [...bad, mark("ok", 0, 2)]);
    expect(segs.map((s) => [s.text, ids(s)])).toEqual([
      ["sh", ["ok"]],
      ["ort", []],
    ]);
    expect(join(buildSegments(text, bad))).toBe(text);
  });

  it("uses UTF-16 offsets across an emoji (surrogate pair)", () => {
    const text = "I said \u{1F600} then I was at home.";
    // The emoji is two UTF-16 code units: "I said " = 7, emoji = [7, 9).
    expect(text.length).toBe(29);
    const quote = "I was at home";
    const start = 15;
    expect(text.slice(start, start + quote.length)).toBe(quote);
    const segs = buildSegments(text, [mark("q", start, start + quote.length), mark("emoji", 7, 9)]);
    expect(segs.find((s) => ids(s)[0] === "q")?.text).toBe(quote);
    expect(segs.find((s) => ids(s)[0] === "emoji")?.text).toBe("\u{1F600}");
    expect(join(segs)).toBe(text);
  });

  it("rejects a range that would split a surrogate pair", () => {
    const text = "a\u{1F600}b";
    expect(isValidRange(text, 0, 2)).toBe(false);
    expect(isValidRange(text, 2, 4)).toBe(false);
    expect(isValidRange(text, 1, 3)).toBe(true);
    expect(join(buildSegments(text, [mark("bad", 0, 2)]))).toBe(text);
    expect(buildSegments(text, [mark("bad", 0, 2)])[0]?.marks).toEqual([]);
  });
});

describe("sliceRange", () => {
  it("slices valid ranges and returns null for bad ones", () => {
    expect(sliceRange("hello world", 6, 11)).toBe("world");
    expect(sliceRange("hello", 3, 10)).toBeNull();
  });
});
