/**
 * Split a pasted deposition transcript into Q/A pairs.
 *
 * Offsets are UTF-16 code units into the ORIGINAL string, half-open [start, end)
 * (String.prototype.slice semantics). The text is never normalised: every
 * `question` / `answer` equals `text.slice(start, end)`.
 *
 * Tolerated: a header (anything before the first Q line), blank lines, "Q:"/"Q."
 * and "A:"/"A." prefixes, CRLF line endings, and multi-line questions/answers
 * (continuation lines, including after blank lines, belong to the current block
 * until the next Q or A line).
 */

export interface QAPair {
  /** Stable id by order of appearance: Q1, Q2, ... */
  id: string;
  question: string;
  questionStart: number;
  questionEnd: number;
  answer: string;
  answerStart: number;
  answerEnd: number;
}

export interface ParsedTranscript {
  text: string;
  /** Text before the first Q/A line (trailing whitespace excluded). */
  header: string;
  qa: QAPair[];
}

interface Line {
  start: number;
  /** End of line content, excluding "\n" and a trailing "\r". */
  end: number;
}

function splitLines(text: string): Line[] {
  const out: Line[] = [];
  let start = 0;
  while (start <= text.length) {
    const nl = text.indexOf("\n", start);
    const rawEnd = nl === -1 ? text.length : nl;
    const end = rawEnd > start && text.charCodeAt(rawEnd - 1) === 13 ? rawEnd - 1 : rawEnd;
    out.push({ start, end });
    if (nl === -1) break;
    start = nl + 1;
  }
  return out;
}

const MARKER = /^[ \t]*([QA])[.:][ \t]*/;

interface Block {
  /** null while the block has no content yet (marker line with nothing after it). */
  start: number | null;
  end: number;
}

function blockText(text: string, b: Block | null): { s: string; start: number; end: number } {
  if (!b || b.start === null) return { s: "", start: b?.end ?? 0, end: b?.end ?? 0 };
  return { s: text.slice(b.start, b.end), start: b.start, end: b.end };
}

export function parseTranscript(text: string): ParsedTranscript {
  const lines = splitLines(text);
  let headerEnd = 0;
  let seenMarker = false;
  const pairs: { q: Block | null; a: Block | null }[] = [];
  let current: Block | null = null;

  for (const line of lines) {
    const content = text.slice(line.start, line.end);
    const m = MARKER.exec(content);
    if (m) {
      seenMarker = true;
      const rest = content.slice(m[0].length).trimEnd();
      const contentStart = line.start + m[0].length;
      const block: Block = rest.length > 0 ? { start: contentStart, end: contentStart + rest.length } : { start: null, end: contentStart };
      const last = pairs[pairs.length - 1];
      if (m[1] === "Q") pairs.push({ q: block, a: null });
      else if (last && last.a === null) last.a = block;
      else pairs.push({ q: null, a: block }); // answer without a preceding question
      current = block;
      continue;
    }
    if (!seenMarker) {
      if (content.trim().length > 0) headerEnd = line.start + content.trimEnd().length;
      continue;
    }
    // Continuation line (blank lines are skipped, not terminators).
    if (current && content.trim().length > 0) {
      if (current.start === null) current.start = line.start + (content.length - content.trimStart().length);
      current.end = line.start + content.trimEnd().length;
    }
  }

  const qa: QAPair[] = pairs.map((p, i) => {
    const q = blockText(text, p.q);
    const a = blockText(text, p.a);
    return {
      id: `Q${i + 1}`,
      question: q.s,
      questionStart: q.start,
      questionEnd: q.end,
      answer: a.s,
      answerStart: a.start,
      answerEnd: a.end,
    };
  });
  return { text, header: text.slice(0, headerEnd).trimStart(), qa };
}
