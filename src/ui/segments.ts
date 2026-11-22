/**
 * Offset -> text segments for highlighting.
 *
 * Highlights are built ONLY from UTF-16 [start, end) offsets by slicing the
 * transcript string (String.prototype.slice semantics, same as the engine's
 * quote validation). Quote text is never searched for.
 */

/** Visual weight of a highlight. Order matters: earlier = stronger. */
export type Tone = "contradiction" | "review" | "dismissed";

const TONE_RANK: Record<Tone, number> = { contradiction: 0, review: 1, dismissed: 2 };

export interface Mark {
  /** Id of the finding this range belongs to. */
  id: string;
  start: number;
  end: number;
  tone: Tone;
}

export interface Segment {
  start: number;
  end: number;
  text: string;
  /** Marks covering this whole segment, strongest tone first, then input order. Empty = plain text. */
  marks: Mark[];
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}
function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

/** True when `offset` falls between the two code units of a surrogate pair (would split an emoji). */
function splitsSurrogatePair(text: string, offset: number): boolean {
  if (offset <= 0 || offset >= text.length) return false;
  return isHighSurrogate(text.charCodeAt(offset - 1)) && isLowSurrogate(text.charCodeAt(offset));
}

/**
 * A range is usable when it is a non-empty, in-bounds, integer half-open range
 * that does not cut a surrogate pair in half. Anything else is ignored.
 */
export function isValidRange(text: string, start: number, end: number): boolean {
  if (!Number.isInteger(start) || !Number.isInteger(end)) return false;
  if (start < 0 || end > text.length || start >= end) return false;
  if (splitsSurrogatePair(text, start) || splitsSurrogatePair(text, end)) return false;
  return true;
}

/**
 * Split `text` into consecutive segments at every mark boundary. Overlapping and
 * adjacent ranges are handled by cutting at all boundaries; each segment lists
 * every mark that covers it. Invalid ranges are dropped. The concatenation of
 * all segment texts always equals `text`.
 */
export function buildSegments(text: string, marks: readonly Mark[]): Segment[] {
  if (text.length === 0) return [];
  const valid = marks.filter((m) => isValidRange(text, m.start, m.end));

  const cuts = new Set<number>([0, text.length]);
  for (const m of valid) {
    cuts.add(m.start);
    cuts.add(m.end);
  }
  const points = [...cuts].sort((x, y) => x - y);

  const order = new Map<Mark, number>();
  valid.forEach((m, i) => order.set(m, i));

  const segments: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];
    if (start === undefined || end === undefined || start >= end) continue;
    const covering = valid
      .filter((m) => m.start <= start && m.end >= end)
      .sort((x, y) => TONE_RANK[x.tone] - TONE_RANK[y.tone] || (order.get(x) ?? 0) - (order.get(y) ?? 0));
    segments.push({ start, end, text: text.slice(start, end), marks: covering });
  }
  return segments;
}

/** Strongest tone of a segment, or null for plain text. */
export function segmentTone(segment: Segment): Tone | null {
  return segment.marks[0]?.tone ?? null;
}

/** Slice a range from the transcript, or null when the range is unusable. */
export function sliceRange(text: string, start: number, end: number): string | null {
  return isValidRange(text, start, end) ? text.slice(start, end) : null;
}
