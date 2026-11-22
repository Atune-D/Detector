/**
 * Response schemas for the two LLM calls (spec §1, §2.1).
 *
 * Each schema exists twice, deliberately kept in lock-step:
 * - a JSON Schema sent to the API as the structured-output format;
 * - a strict zod schema that re-validates every response at runtime. Unknown
 *   fields, missing fields, or values outside the controlled vocabulary make the
 *   call malformed. Nothing the model returns is trusted because the API was asked
 *   to follow a schema.
 *
 * Neither schema has any score / confidence / verdict field. The engine scores.
 */
import { z } from "zod";
import { POLICY, PREDICATE_KINDS, RULE_IDS, type Predicate } from "@/engine";

export const PREDICATES = Object.keys(PREDICATE_KINDS) as [Predicate, ...Predicate[]];
export const PERIODS = Object.keys(POLICY.vocabularyPeriods) as [string, ...string[]];
export const GRANULARITIES = ["person", "room", "building", "unit", "site", "area", "city", "region", "other"] as const;
export const TEMPLATE_IDS = [RULE_IDS.aloneVsCopresent] as const;
export const COMPARE_KINDS = ["negation", "event_time", "state", "template"] as const;

/** "HH:MM", hours 0–47 so a time after midnight can stay on the night's date ("25:00" = 1am next day). */
const CLOCK = /^([0-9]|[0-3][0-9]|4[0-7]):[0-5][0-9]$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------------------
// zod (runtime validation)
// ---------------------------------------------------------------------------

const zEntity = z
  .object({
    id: z.string().min(1),
    label: z.string(),
    granularity: z.enum(GRANULARITIES),
    partOf: z.array(z.string().min(1)),
  })
  .strict();

const zTimeMarker = z.object({ text: z.string().min(1), class: z.enum(["exact", "approx", "hedge"]) }).strict();
const zBound = z.object({ date: z.string().regex(DATE), time: z.string().regex(CLOCK), markers: z.array(zTimeMarker) }).strict();

const zTime = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("instant"),
      original: z.string(),
      date: z.string().regex(DATE),
      from: z.string().regex(CLOCK),
      to: z.string().regex(CLOCK),
      markers: z.array(zTimeMarker),
    })
    .strict(),
  z.object({ kind: z.literal("interval"), original: z.string(), start: zBound, end: zBound }).strict(),
  z.object({ kind: z.literal("period"), original: z.string(), date: z.string().regex(DATE), period: z.enum(PERIODS) }).strict(),
  z.object({ kind: z.literal("all_time"), original: z.string() }).strict(),
  z.object({ kind: z.literal("some_time"), original: z.string() }).strict(),
  z.object({ kind: z.literal("unanchored"), original: z.string() }).strict(),
]);

const zStateSource = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("explicit") }).strict(),
  z
    .object({
      kind: z.literal("derived"),
      activity: z.object({ predicate: z.enum(PREDICATES), counterpart: z.string().min(1).nullable(), text: z.string().min(1) }).strict(),
    })
    .strict(),
]);

const zOccurrence = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("definite") }).strict(),
    z.object({ kind: z.literal("ordinal"), n: z.number().int().min(1) }).strict(),
  ])
  .nullable();

export function extractionZod(qaIds: readonly string[]) {
  const [first, ...rest] = qaIds;
  const zQaId = first === undefined ? z.never() : z.enum([first, ...rest]);
  const zFact = z
    .object({
      qaId: zQaId,
      quote: z.string().min(1),
      person: z.string().min(1),
      action: z.enum(PREDICATES),
      object: zEntity.nullable(),
      location: zEntity.nullable(),
      time: zTime,
      polarity: z.enum(["affirmative", "negative", "undetermined"]),
      negationForm: z.enum(["whole", "universal", "certainty"]).nullable(),
      stateSource: zStateSource,
      uncertaintyMarkers: z.array(z.object({ text: z.string().min(1), modifies: z.enum(["action", "time", "others_action"]) }).strict()),
      occurrence: zOccurrence,
    })
    .strict()
    .superRefine((f, ctx) => {
      // Fact contract: negationForm is required for a negative fact and null otherwise.
      if ((f.polarity === "negative") !== (f.negationForm !== null)) {
        ctx.addIssue({ code: "custom", message: `negationForm must be set iff polarity is negative (polarity=${f.polarity})` });
      }
    });
  return z.object({ facts: z.array(zFact) }).strict();
}

export type ExtractionOutput = z.infer<ReturnType<typeof extractionZod>>;
export type ExtractedFact = ExtractionOutput["facts"][number];

export function nominationZod(factIdsA: readonly string[], factIdsB: readonly string[]) {
  const en = (ids: readonly string[]) => {
    const [first, ...rest] = ids;
    return first === undefined ? z.never() : z.enum([first, ...rest]);
  };
  return z
    .object({
      nominations: z.array(
        z
          .object({
            factIdA: en(factIdsA),
            factIdB: en(factIdsB),
            kind: z.enum(COMPARE_KINDS),
            templateId: z.enum(TEMPLATE_IDS).nullable(),
            reason: z.string().min(1),
          })
          .strict(),
      ),
    })
    .strict();
}

export type NominationOutput = z.infer<ReturnType<typeof nominationZod>>;

// ---------------------------------------------------------------------------
// JSON Schema (structured-output format sent to the API)
// ---------------------------------------------------------------------------

type Json = { [key: string]: unknown };

const str = (description?: string): Json => (description ? { type: "string", description } : { type: "string" });
const nullable = (s: Json): Json => ({ anyOf: [s, { type: "null" }] });
const obj = (properties: Record<string, Json>, description?: string): Json => ({
  type: "object",
  ...(description ? { description } : {}),
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const arr = (items: Json): Json => ({ type: "array", items });
const enm = (values: readonly string[], description?: string): Json => ({ type: "string", enum: [...values], ...(description ? { description } : {}) });

const jEntity = obj({
  id: str("Normalised snake_case id; the same real-world thing must always get the same id."),
  label: str("The wording used in the testimony."),
  granularity: enm(GRANULARITIES),
  partOf: arr(str()),
});
const jTimeMarker = obj({ text: str("Marker word(s) copied verbatim from the quote."), class: enm(["exact", "approx", "hedge"]) });
const jDate = { type: "string", format: "date" };
const jClock = str('"HH:MM"; hours may go past 24 to stay on the night\'s date ("24:00" = midnight, "25:00" = 1am).');
const jBound = obj({ date: jDate, time: jClock, markers: arr(jTimeMarker) });

const jTime: Json = {
  anyOf: [
    obj({ kind: { type: "string", const: "instant" }, original: str(), date: jDate, from: jClock, to: jClock, markers: arr(jTimeMarker) }),
    obj({ kind: { type: "string", const: "interval" }, original: str(), start: jBound, end: jBound }),
    obj({ kind: { type: "string", const: "period" }, original: str(), date: jDate, period: enm(PERIODS) }),
    obj({ kind: { type: "string", const: "all_time" }, original: str() }),
    obj({ kind: { type: "string", const: "some_time" }, original: str() }),
    obj({ kind: { type: "string", const: "unanchored" }, original: str() }),
  ],
};

const jStateSource: Json = {
  anyOf: [
    obj({ kind: { type: "string", const: "explicit" } }),
    obj({
      kind: { type: "string", const: "derived" },
      activity: obj({ predicate: enm(PREDICATES), counterpart: nullable(str()), text: str("The original activity wording, verbatim.") }),
    }),
  ],
};

export function extractionJsonSchema(qaIds: readonly string[]): Json {
  return obj({
    facts: arr(
      obj({
        qaId: enm(qaIds),
        quote: str("Verbatim substring of that Q/A's answer. Copy exactly; do not paraphrase or fix typos."),
        person: str(),
        action: enm(PREDICATES),
        object: nullable(jEntity),
        location: nullable(jEntity),
        time: jTime,
        polarity: enm(["affirmative", "negative", "undetermined"]),
        negationForm: nullable(enm(["whole", "universal", "certainty"])),
        stateSource: jStateSource,
        uncertaintyMarkers: arr(obj({ text: str("Verbatim from the quote."), modifies: enm(["action", "time", "others_action"]) })),
        occurrence: nullable({
          anyOf: [obj({ kind: { type: "string", const: "definite" } }), obj({ kind: { type: "string", const: "ordinal" }, n: { type: "integer" } })],
        }),
      }),
    ),
  });
}

export function nominationJsonSchema(factIdsA: readonly string[], factIdsB: readonly string[]): Json {
  return obj({
    nominations: arr(
      obj({
        factIdA: enm(factIdsA),
        factIdB: enm(factIdsB),
        kind: enm(COMPARE_KINDS),
        templateId: nullable(enm(TEMPLATE_IDS)),
        reason: str("One short sentence: why these two facts might conflict."),
      }),
    ),
  });
}

/** Words in a field name that would carry a model-made judgement. Rejected anywhere in a response. */
const FORBIDDEN_WORDS = new Set(["score", "scores", "scoring", "confidence", "probability", "likelihood", "verdict", "rating", "severity", "contradiction", "conflict"]);

/** Split a key into lower-case words: "contradictionScore" / "confidence_level" -> [..., "score"] / ["confidence", "level"]. */
function keyWords(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter((w) => w.length > 0)
    .map((w) => w.toLowerCase());
}

function isForbiddenKey(key: string): boolean {
  return keyWords(key).some((w) => FORBIDDEN_WORDS.has(w));
}

/** Path of the first forbidden key in a parsed JSON value, or null. */
export function findForbiddenKey(value: unknown, path = "$"): string | null {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = findForbiddenKey(value[i], `${path}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }
  if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (isForbiddenKey(k)) return `${path}.${k}`;
      const hit = findForbiddenKey(v, `${path}.${k}`);
      if (hit) return hit;
    }
  }
  return null;
}
