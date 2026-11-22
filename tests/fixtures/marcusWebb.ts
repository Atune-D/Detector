/**
 * Spec §6.2 sample: Marcus Webb, March (A) vs September (B) 2023 deposition — the
 * brief's real transcripts, verbatim (src/sample/transcripts.ts). The incident is the
 * evening of November 3rd, 2022.
 *
 * Hand-built engine-level facts against the real text (every quote is a verbatim
 * substring of its answer, offsets computed from the real string). They model the
 * same reading as the saved replay extraction in src/sample/replay.json.
 * Questions and the "evening of November 3rd" anchor are part of the input, as §6.2 requires.
 */
import type { Fact, Nomination } from "../../src/engine";
import { SAMPLE_TRANSCRIPT_A, SAMPLE_TRANSCRIPT_B } from "../../src/sample/transcripts";
import { parseTranscript } from "../../src/server/transcript";
import type { TranscriptId } from "../../src/engine";
import { E, allTime, at, atRange, fact, period, someTime, tm, unanchored, type BuiltTranscript } from "./builders";

export const NOV3 = "2022-11-03";
const cho = { id: "daniel_cho", label: "Daniel Cho", granularity: "person" } as const;

function fromText(id: TranscriptId, text: string): BuiltTranscript {
  const parsed = parseTranscript(text);
  return {
    id,
    text,
    qa: new Map(parsed.qa.map((q) => [q.id, { question: q.question, answer: q.answer, answerStart: q.answerStart }])),
  };
}

export const march = fromText("A", SAMPLE_TRANSCRIPT_A);
export const september = fromText("B", SAMPLE_TRANSCRIPT_B);

export const transcripts = { A: march.text, B: september.text };

// --- March (A) --------------------------------------------------------------------

export const mHomeAllEvening = fact(march, "Q1", { id: "M1-home", action: "location.home", time: period(NOV3, "evening", "all evening") }, "I was at home all evening");

export const mOrderedPizza = fact(march, "Q1", {
  id: "M2-pizza",
  action: "activity.ordered_food",
  time: at(NOV3, "19:00", [tm("around", "approx")], "around 7pm"),
}, "I ordered pizza around 7pm");

export const mWatchedTv = fact(march, "Q1", { id: "M1-tv", action: "activity.watching_tv", time: period(NOV3, "evening", "the evening of November 3rd") }, "watched TV");

/** "Did you speak to anyone that night?" — "that night" refers back to the evening of November 3rd (Q1). */
export const mAlone = fact(march, "Q2", {
  id: "M4-alone",
  action: "company.alone",
  location: E.home,
  time: period(NOV3, "evening", "that night"),
}, "No, I was alone");

/** "Around 10, maybe 10:30" parsed to 22:00–22:30 first, then widened by the widest marker (maybe, ±30). */
export const mSleepOnset = fact(march, "Q3", {
  id: "M3-sleep",
  action: "sleep_onset",
  time: atRange(NOV3, "22:00", "22:30", [tm("Around", "approx"), tm("maybe", "hedge")], "Around 10, maybe 10:30"),
  uncertainty: [{ text: "maybe", modifies: "time" }],
}, "Around 10, maybe 10:30");

export const mNeverBeenToWarehouse = fact(march, "Q4", {
  id: "M5-not-been",
  action: "been_to",
  polarity: "negative",
  object: E.warehouse,
  time: allTime("never"),
}, "No, never.");

/** "Had you met Daniel Cho before November 3rd? — No." The open-ended "before" cannot be placed as a TimeSpec range. */
export const mNotMetCho = fact(march, "Q6", { id: "M7-not-met", action: "met", polarity: "negative", object: cho, time: unanchored("before November 3rd") }, "No.");

export const mNeverHeardOfCho = fact(march, "Q6", {
  id: "M6-not-known",
  action: "knows_of",
  polarity: "negative",
  object: cho,
  time: unanchored("before this whole thing started"),
}, "I'd never heard of him before this whole thing started");

// --- September (B) ----------------------------------------------------------------

const S1_QUOTE = "I think I went out briefly to get some groceries, maybe around 7:30";

export const sHome = fact(september, "Q1", { id: "S1-home", action: "location.home", time: period(NOV3, "evening", "the evening of November 3rd") }, "I was home.");

export const sWentOut = fact(september, "Q1", {
  id: "S1-out",
  action: "location.out",
  time: at(NOV3, "19:30", [tm("maybe", "hedge"), tm("around", "approx")], "maybe around 7:30"),
  uncertainty: [{ text: "I think", modifies: "action" }, { text: "maybe", modifies: "time" }],
}, S1_QUOTE);

export const sGroceries = fact(september, "Q1", {
  id: "S1-groceries",
  action: "activity.bought_groceries",
  time: at(NOV3, "19:30", [tm("maybe", "hedge"), tm("around", "approx")], "maybe around 7:30"),
  uncertainty: [{ text: "I think", modifies: "action" }, { text: "maybe", modifies: "time" }],
}, S1_QUOTE);

export const sMightHaveOrdered = fact(september, "Q2", {
  id: "S2-pizza",
  action: "activity.ordered_food",
  time: period(NOV3, "evening", "the evening of November 3rd"),
  uncertainty: [{ text: "might", modifies: "action" }],
}, "I might have done both");

export const sWavedTom = fact(september, "Q3", {
  id: "S4-waved",
  action: "activity.waved",
  object: E.tom,
  location: E.parkingLot,
  time: period(NOV3, "evening", "that evening"),
  uncertainty: [
    { text: "might", modifies: "others_action" },
    { text: "or something", modifies: "action" },
  ],
});

/** The waving happened "in the parking lot": its place is extracted as its own location fact (§3.3). */
export const sParkingLot = fact(september, "Q3", {
  id: "S4-parking-lot",
  action: "location.place",
  location: E.parkingLot,
  time: period(NOV3, "evening", "that evening"),
}, "We waved or something in the parking lot");

export const sSleepOnset = fact(september, "Q4", {
  id: "S3-sleep",
  action: "sleep_onset",
  time: at(NOV3, "24:00", [tm("maybe", "hedge")], "Midnight maybe"),
  uncertainty: [{ text: "maybe", modifies: "time" }],
}, "It was late. Midnight maybe.");

export const sDroveThroughArea = fact(september, "Q5", {
  id: "S5-passed",
  action: "passed_through",
  object: E.hargroveArea,
  time: someTime("I've driven through"),
}, "I've driven through that part of town");

export const sKnewOfCho = fact(september, "Q6", { id: "S6-knew-of", action: "knows_of", object: cho, time: unanchored("knew") }, "I knew of him");

export const sMetChoUndetermined = fact(september, "Q6", {
  id: "S7-met",
  action: "met",
  polarity: "undetermined",
  object: cho,
  time: unanchored("I'd met"),
  uncertainty: [{ text: "I don't think", modifies: "action" }],
}, "I don't think I'd met him face to face");

export const marchFacts: Fact[] = [mHomeAllEvening, mOrderedPizza, mWatchedTv, mAlone, mSleepOnset, mNeverBeenToWarehouse, mNotMetCho, mNeverHeardOfCho];
export const septemberFacts: Fact[] = [
  sHome,
  sWentOut,
  sGroceries,
  sMightHaveOrdered,
  sWavedTom,
  sParkingLot,
  sSleepOnset,
  sDroveThroughArea,
  sKnewOfCho,
  sMetChoUndetermined,
];

/** AI nominations for the pairs the program table does not pair by itself. */
export const nominations: Nomination[] = [
  { factIdA: "M2-pizza", factIdB: "S1-groceries", kind: "state", reason: "pizza delivery implies home; groceries imply out" },
  { factIdA: "M4-alone", factIdB: "S4-waved", kind: "template", templateId: "R_TEMPLATE_ALONE_VS_COPRESENT", reason: "said alone, later says Tom saw him" },
  { factIdA: "M5-not-been", factIdB: "S5-passed", kind: "negation", reason: "denied the warehouse, later admits the area" },
];
