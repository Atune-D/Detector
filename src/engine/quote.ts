/**
 * Quote location / validation (spec §1 "原文引用由程序定位校验").
 * Offsets are UTF-16 code units, half-open [start, end) — i.e. String.prototype.slice semantics.
 */
export type QuoteCheck = { ok: true } | { ok: false; reason: string };

export function validateQuote(text: string, quote: string, start: number, end: number): QuoteCheck {
  if (!Number.isInteger(start) || !Number.isInteger(end)) return { ok: false, reason: "offsets are not integers" };
  if (start < 0 || end > text.length || start >= end) return { ok: false, reason: `offsets [${start},${end}) out of bounds` };
  if (quote.length === 0) return { ok: false, reason: "empty quote" };
  const actual = text.slice(start, end);
  if (actual !== quote) return { ok: false, reason: `text at [${start},${end}) does not match quote` };
  return { ok: true };
}

/** All start offsets where `quote` occurs verbatim in `text`, ascending. Empty if absent. */
export function locateQuote(text: string, quote: string): number[] {
  const out: number[] = [];
  if (quote.length === 0) return out;
  let i = text.indexOf(quote);
  while (i !== -1) {
    out.push(i);
    i = text.indexOf(quote, i + 1);
  }
  return out;
}
