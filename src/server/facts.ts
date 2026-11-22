/**
 * Turn validated extraction output into engine Facts.
 *
 * The model supplies quote TEXT only; offsets are computed here with the engine's
 * quote helper, inside the answer of the Q/A pair the model named. If the quote
 * (or a marker / retained activity that must lie inside it) cannot be found, the
 * fact keeps the model's quote but gets the sentinel offsets [-1, -1): the engine's
 * quote validation then turns every candidate built on that fact into an analysis
 * error. Nothing is dropped and nothing is "repaired".
 */
import { locateQuote, type Entity, type Fact, type TimeMarker, type TimeSpec, type TranscriptId } from "@/engine";
import type { ExtractedFact } from "./llm/schema";
import type { ParsedTranscript, QAPair } from "./transcript";

export const UNLOCATED = -1;

const PLACE_OBJECT_PREDICATES: ReadonlySet<string> = new Set(["been_to", "entered", "passed_through"]);

function minutes(clock: string): number {
  const [h, m] = clock.split(":");
  return Number(h) * 60 + Number(m);
}

function entity(e: ExtractedFact["object"]): Entity | undefined {
  if (!e) return undefined;
  const out: Entity = { id: e.id, label: e.label, granularity: e.granularity };
  if (e.partOf.length > 0) out.partOf = [...e.partOf];
  return out;
}

/** Locate `needle` inside `quote` (which starts at `quoteStart`); null when absent or the quote is unlocated. */
function spanIn(quote: string, quoteStart: number, needle: string): { start: number; end: number } | null {
  if (quoteStart === UNLOCATED) return null;
  const i = quote.indexOf(needle);
  return i < 0 ? null : { start: quoteStart + i, end: quoteStart + i + needle.length };
}

function timeMarkers(markers: readonly { text: string; class: TimeMarker["class"] }[], quote: string, quoteStart: number, missing: string[]): TimeMarker[] {
  return markers.map((m) => {
    const span = spanIn(quote, quoteStart, m.text);
    if (!span) missing.push(m.text);
    return span ? { text: m.text, class: m.class, span } : { text: m.text, class: m.class };
  });
}

function timeSpec(t: ExtractedFact["time"], quote: string, quoteStart: number, missing: string[]): TimeSpec {
  switch (t.kind) {
    case "instant":
      return {
        kind: "instant",
        original: t.original,
        date: t.date,
        from: minutes(t.from),
        to: minutes(t.to),
        markers: timeMarkers(t.markers, quote, quoteStart, missing),
      };
    case "interval":
      return {
        kind: "interval",
        original: t.original,
        start: { date: t.start.date, minute: minutes(t.start.time), markers: timeMarkers(t.start.markers, quote, quoteStart, missing) },
        end: { date: t.end.date, minute: minutes(t.end.time), markers: timeMarkers(t.end.markers, quote, quoteStart, missing) },
      };
    case "period":
      return { kind: "period", original: t.original, date: t.date, period: t.period };
    case "all_time":
    case "some_time":
    case "unanchored":
      return { kind: t.kind, original: t.original };
  }
}

/** Where the quote starts in the transcript: first occurrence inside the named answer, or UNLOCATED. */
function locateInAnswer(text: string, qa: QAPair, quote: string): number {
  for (const at of locateQuote(text, quote)) {
    if (at >= qa.answerStart && at + quote.length <= qa.answerEnd) return at;
  }
  return UNLOCATED;
}

export function toFacts(transcript: TranscriptId, parsed: ParsedTranscript, extracted: readonly ExtractedFact[]): Fact[] {
  const qaById = new Map(parsed.qa.map((q) => [q.id, q]));
  return extracted.map((x, i) => {
    const qa = qaById.get(x.qaId);
    let start = qa ? locateInAnswer(parsed.text, qa, x.quote) : UNLOCATED;
    const missing: string[] = [];

    const time = timeSpec(x.time, x.quote, start, missing);
    const uncertaintyMarkers = x.uncertaintyMarkers.map((m) => {
      const span = spanIn(x.quote, start, m.text);
      if (!span) missing.push(m.text);
      return { text: m.text, modifies: m.modifies, span: span ?? { start: UNLOCATED, end: UNLOCATED } };
    });
    if (x.stateSource.kind === "derived" && !x.quote.includes(x.stateSource.activity.text)) missing.push(x.stateSource.activity.text);

    // Any part of the evidence that is not verbatim in the quote invalidates the whole fact's location.
    if (missing.length > 0) start = UNLOCATED;
    const end = start === UNLOCATED ? UNLOCATED : start + x.quote.length;

    const fact: Fact = {
      id: `${transcript}${i + 1}`,
      person: x.person,
      action: x.action,
      // Marker spans are only kept when the whole fact is located.
      time: start === UNLOCATED ? timeSpec(x.time, x.quote, UNLOCATED, []) : time,
      polarity: x.polarity,
      negationForm: x.negationForm,
      stateSource:
        x.stateSource.kind === "explicit"
          ? { kind: "explicit" }
          : {
              kind: "derived",
              activity: {
                predicate: x.stateSource.activity.predicate,
                text: x.stateSource.activity.text,
                ...(x.stateSource.activity.counterpart !== null ? { counterpart: x.stateSource.activity.counterpart } : {}),
              },
            },
      uncertaintyMarkers: start === UNLOCATED ? uncertaintyMarkers.map((m) => ({ ...m, span: { start: UNLOCATED, end: UNLOCATED } })) : uncertaintyMarkers,
      source: { transcript, qaId: x.qaId, question: qa?.question ?? "", quote: x.quote, start, end },
    };
    // For place predicates the place IS the object ("been to the warehouse"). The model
    // sometimes files it under location instead; move it so both sides compare the same slot.
    const placeAsObject = PLACE_OBJECT_PREDICATES.has(x.action) && !x.object && !!x.location;
    const object = entity(placeAsObject ? x.location : x.object);
    const location = placeAsObject ? undefined : entity(x.location);
    if (object) fact.object = object;
    if (location) fact.location = location;
    if (x.occurrence) fact.occurrence = x.occurrence;
    return fact;
  });
}
