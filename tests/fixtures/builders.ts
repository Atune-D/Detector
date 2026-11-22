/**
 * Hand-built fact fixtures. Facts are built against real transcript text so every
 * quote and marker carries correct UTF-16 offsets (quote validation passes unless a
 * test corrupts it on purpose).
 */
import { candidateId } from "../../src/engine";
import type {
  Candidate,
  CompareKind,
  Entity,
  Fact,
  IntervalBound,
  NegationForm,
  Polarity,
  Predicate,
  StateSource,
  TimeMarker,
  TimeMarkerClass,
  TimeSpec,
  TranscriptId,
  UncertaintyTarget,
} from "../../src/engine";

export interface QA {
  qaId: string;
  question: string;
  answer: string;
}

export interface BuiltTranscript {
  id: TranscriptId;
  text: string;
  qa: ReadonlyMap<string, { question: string; answer: string; answerStart: number }>;
}

export function transcript(id: TranscriptId, qas: readonly QA[]): BuiltTranscript {
  let text = "";
  const qa = new Map<string, { question: string; answer: string; answerStart: number }>();
  for (const x of qas) {
    text += `Q: ${x.question}\nA: `;
    qa.set(x.qaId, { question: x.question, answer: x.answer, answerStart: text.length });
    text += `${x.answer}\n\n`;
  }
  return { id, text, qa };
}

// --- time helpers ------------------------------------------------------------

export function hm(s: string): number {
  const [h, m] = s.split(":").map(Number);
  if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) throw new Error(`bad time ${s}`);
  return h * 60 + m;
}

export function tm(text: string, cls: TimeMarkerClass): TimeMarker {
  return { text, class: cls };
}

export function at(date: string, time: string, markers: TimeMarker[] = [], original = time): TimeSpec {
  const m = hm(time);
  return { kind: "instant", original, date, from: m, to: m, markers };
}

export function atRange(date: string, from: string, to: string, markers: TimeMarker[], original: string): TimeSpec {
  return { kind: "instant", original, date, from: hm(from), to: hm(to), markers };
}

export function bound(date: string, time: string, markers: TimeMarker[] = []): IntervalBound {
  return { date, minute: hm(time), markers };
}

export function span(start: IntervalBound, end: IntervalBound, original: string): TimeSpec {
  return { kind: "interval", original, start, end };
}

export function day(date: string, nextDate: string, original: string): TimeSpec {
  return span(bound(date, "00:00"), bound(nextDate, "00:00"), original);
}

export function period(date: string, name: string, original = name): TimeSpec {
  return { kind: "period", original, date, period: name };
}

export const allTime = (original = "ever"): TimeSpec => ({ kind: "all_time", original });
export const someTime = (original = "at some point"): TimeSpec => ({ kind: "some_time", original });
export const unanchored = (original: string): TimeSpec => ({ kind: "unanchored", original });

// --- entities -----------------------------------------------------------------

export const E = {
  home: { id: "home", label: "home", granularity: "building" },
  tom: { id: "tom", label: "Tom", granularity: "person" },
  hargroveArea: { id: "hargrove_area", label: "the Hargrove Street area", granularity: "area" },
  warehouse: { id: "hargrove_warehouse", label: "Hargrove Street warehouse", granularity: "building", partOf: ["hargrove_area"] },
  warehouseOffice: { id: "warehouse_office", label: "the office in the warehouse", granularity: "room", partOf: ["hargrove_warehouse", "hargrove_area"] },
  building: { id: "maple_building", label: "the Maple building", granularity: "building" },
  apartment: { id: "maple_apt_4b", label: "apartment 4B", granularity: "unit", partOf: ["maple_building"] },
  office: { id: "office", label: "my office", granularity: "room", partOf: ["office_building"] },
  lobby: { id: "lobby", label: "the downstairs lobby", granularity: "room", partOf: ["office_building"] },
  parkingLot: { id: "parking_lot", label: "the parking lot", granularity: "site" },
  mall: { id: "mall", label: "the mall", granularity: "building" },
  supermarket: { id: "supermarket", label: "the supermarket", granularity: "building" },
  otherCity: { id: "springfield", label: "Springfield", granularity: "city" },
} as const satisfies Record<string, Entity>;

// --- facts ----------------------------------------------------------------------

export interface FactInput {
  id: string;
  action: Predicate;
  time: TimeSpec;
  person?: string;
  object?: Entity;
  location?: Entity;
  polarity?: Polarity;
  negationForm?: NegationForm | null;
  stateSource?: StateSource;
  /** Uncertainty markers; text must occur inside the quote. */
  uncertainty?: { text: string; modifies: UncertaintyTarget }[];
  occurrence?: Fact["occurrence"];
}

export const WITNESS = "marcus_webb";

/** Build a fact whose quote is `quote` inside answer `qaId` of transcript `t` (quote defaults to the whole answer). */
export function fact(t: BuiltTranscript, qaId: string, input: FactInput, quote?: string): Fact {
  const qa = t.qa.get(qaId);
  if (!qa) throw new Error(`fixture: no qa ${qaId} in transcript ${t.id}`);
  const q = quote ?? qa.answer;
  const within = qa.answer.indexOf(q);
  if (within < 0) throw new Error(`fixture: quote "${q}" not in answer ${qaId}`);
  const start = qa.answerStart + within;
  const polarity = input.polarity ?? "affirmative";
  const f: Fact = {
    id: input.id,
    person: input.person ?? WITNESS,
    action: input.action,
    time: input.time,
    polarity,
    negationForm: input.negationForm !== undefined ? input.negationForm : polarity === "negative" ? "whole" : null,
    stateSource: input.stateSource ?? { kind: "explicit" },
    uncertaintyMarkers: (input.uncertainty ?? []).map((m) => {
      const i = q.indexOf(m.text);
      if (i < 0) throw new Error(`fixture: marker "${m.text}" not in quote "${q}"`);
      return { text: m.text, modifies: m.modifies, span: { start: start + i, end: start + i + m.text.length } };
    }),
    source: { transcript: t.id, qaId, question: qa.question, quote: q, start, end: start + q.length },
  };
  if (input.object) f.object = input.object;
  if (input.location) f.location = input.location;
  if (input.occurrence) f.occurrence = input.occurrence;
  return f;
}

/** A hand-made candidate (as if nominated) for routing one pair to one comparator. */
export function candidate(a: Fact, b: Fact, kind: CompareKind, templateId?: string | null): Candidate {
  return {
    id: candidateId(kind, templateId, a, b),
    a,
    b,
    kind,
    templateId: kind === "template" ? (templateId ?? null) : undefined,
    origins: ["nomination"],
    reasons: ["test"],
  };
}

/** Build two one-question transcripts and a fact on each — the common shape of a §6.1 row. */
export function scenario(
  a: { question: string; answer: string; fact: FactInput; quote?: string },
  b: { question: string; answer: string; fact: FactInput; quote?: string },
) {
  const tA = transcript("A", [{ qaId: "A-1", question: a.question, answer: a.answer }]);
  const tB = transcript("B", [{ qaId: "B-1", question: b.question, answer: b.answer }]);
  return {
    transcripts: { A: tA.text, B: tB.text },
    a: fact(tA, "A-1", a.fact, a.quote),
    b: fact(tB, "B-1", b.fact, b.quote),
  };
}
