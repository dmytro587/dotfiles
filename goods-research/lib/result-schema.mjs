import { Type } from "typebox";
import { Value } from "typebox/value";

export const MAX_RETURNED_STRING_LENGTH = 2_000;
export const MAX_CANDIDATES = 12;
export const MAX_SOURCES_PER_CANDIDATE = 20;

const text = (options = {}) =>
  Type.String({ minLength: 1, maxLength: MAX_RETURNED_STRING_LENGTH, ...options });
const url = () => text({ pattern: "^https?://" });
const nullableText = () => Type.Union([text(), Type.Null()]);
const nullableUrl = () => Type.Union([url(), Type.Null()]);

const BudgetConversionSchema = Type.Object(
  {
    country: text(),
    provider: Type.Literal("Frankfurter"),
    sourceCurrency: Type.String({ pattern: "^[A-Z]{3}$" }),
    sourceBudgetMin: Type.Union([Type.Number({ minimum: 0 }), Type.Null()]),
    sourceBudgetMax: Type.Union([Type.Number({ minimum: 0 }), Type.Null()]),
    targetCurrency: Type.String({ pattern: "^[A-Z]{3}$" }),
    rate: Type.Number({ exclusiveMinimum: 0 }),
    effectiveDate: text({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
    budgetMin: Type.Union([Type.Number({ minimum: 0 }), Type.Null()]),
    budgetMax: Type.Union([Type.Number({ minimum: 0 }), Type.Null()]),
  },
  { additionalProperties: false },
);

export const MarketSchema = Type.Object(
  {
    deliveryCountry: text(),
    deliveryRegion: nullableText(),
    retailerScope: Type.Union([Type.Literal("delivery_eligible"), Type.Literal("local_only")]),
    currency: Type.Union([Type.String({ pattern: "^[A-Z]{3}$" }), Type.Null()]),
    budgetConversion: Type.Optional(BudgetConversionSchema),
  },
  { additionalProperties: false },
);

export const RubricSchema = Type.Object(
  {
    hardGates: Type.Array(text(), { maxItems: 40 }),
    preferences: Type.Array(text(), { maxItems: 40 }),
    assumptions: Type.Array(text(), { maxItems: 40 }),
  },
  { additionalProperties: false },
);

export const PriceComponentSchema = Type.Object(
  {
    label: text(),
    display: text(),
    known: Type.Boolean(),
  },
  { additionalProperties: false },
);

export const PriceSchema = Type.Object(
  {
    display: text(),
    amount: Type.Union([Type.Number({ minimum: 0 }), Type.Null()]),
    currency: Type.Union([Type.String({ pattern: "^[A-Z]{3}$" }), Type.Null()]),
    completeness: Type.Union([Type.Literal("full"), Type.Literal("partial")]),
    components: Type.Array(PriceComponentSchema, { maxItems: 12 }),
  },
  { additionalProperties: false },
);

export const AvailabilitySchema = Type.Object(
  {
    status: Type.Union([
      Type.Literal("in_stock"),
      Type.Literal("limited"),
      Type.Literal("preorder"),
    ]),
    display: text(),
    checkedAt: text(),
  },
  { additionalProperties: false },
);

export const VerifiedFactSchema = Type.Object(
  {
    label: text(),
    value: text(),
    sourceUrl: url(),
  },
  { additionalProperties: false },
);

export const ReasonSchema = Type.Object(
  {
    text: text(),
    basisSourceUrls: Type.Array(url(), { maxItems: MAX_SOURCES_PER_CANDIDATE }),
  },
  { additionalProperties: false },
);

export const SourceLinkSchema = Type.Object(
  {
    label: text(),
    url: url(),
  },
  { additionalProperties: false },
);

export const CandidateSchema = Type.Object(
  {
    id: text(),
    rank: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
    brand: text(),
    name: text(),
    variant: text(),
    seller: text(),
    productUrl: url(),
    imageUrl: nullableUrl(),
    imageAlt: nullableText(),
    imageUnavailableReason: nullableText(),
    price: PriceSchema,
    availability: AvailabilitySchema,
    description: text(),
    verifiedFacts: Type.Array(VerifiedFactSchema, { maxItems: 30 }),
    pros: Type.Array(ReasonSchema, { maxItems: 20 }),
    cons: Type.Array(ReasonSchema, { maxItems: 20 }),
    unknowns: Type.Array(text(), { maxItems: 30 }),
    rankingReason: text(),
    sourceLinks: Type.Array(SourceLinkSchema, {
      minItems: 1,
      maxItems: MAX_SOURCES_PER_CANDIDATE,
    }),
  },
  { additionalProperties: false },
);

export const ResearchResultSchema = Type.Object(
  {
    schemaVersion: Type.Literal(3),
    status: Type.Union([Type.Literal("complete"), Type.Literal("no_match")]),
    title: text(),
    requestSummary: text(),
    checkedAt: text(),
    market: MarketSchema,
    rubric: RubricSchema,
    recommendationCandidateId: Type.Union([text(), Type.Null()]),
    candidates: Type.Array(CandidateSchema, { maxItems: MAX_CANDIDATES }),
    noMatchReasons: Type.Array(text(), { maxItems: 20 }),
  },
  { additionalProperties: false },
);

function isHttpUrl(value) {
  if (typeof value !== "string" || value.length > MAX_RETURNED_STRING_LENGTH) {
    return false;
  }

  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      parsed.hostname.length > 0
    );
  } catch {
    return false;
  }
}

function isIsoTimestamp(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
  ) {
    return false;
  }

  return Number.isFinite(Date.parse(value));
}

function isComparableFullPrice(price) {
  return (
    price.completeness === "full" &&
    Number.isFinite(price.amount) &&
    price.currency !== null &&
    price.components.every((component) => component.known)
  );
}

function collectSchemaErrors(value) {
  return [...Value.Errors(ResearchResultSchema, value)].map(
    (error) => `${error.path || "/"}: ${error.message}`,
  );
}

export function validateResearchResult(value) {
  const errors = collectSchemaErrors(value);
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const candidateIds = new Set();
  const ranks = [];

  for (const candidate of value.candidates) {
    if (candidateIds.has(candidate.id)) {
      errors.push(`Duplicate candidate id: ${candidate.id}`);
    }
    candidateIds.add(candidate.id);

    if (!isHttpUrl(candidate.productUrl)) {
      errors.push(`Candidate ${candidate.id} has an invalid direct product URL`);
    }
    if (candidate.imageUrl !== null && !isHttpUrl(candidate.imageUrl)) {
      errors.push(`Candidate ${candidate.id} has an invalid image URL`);
    }
    if (!isIsoTimestamp(candidate.availability.checkedAt)) {
      errors.push(`Candidate ${candidate.id} has an invalid availability timestamp`);
    }

    for (const fact of candidate.verifiedFacts) {
      if (!isHttpUrl(fact.sourceUrl)) {
        errors.push(`Candidate ${candidate.id} has an invalid fact source URL`);
      }
    }
    for (const reason of [...candidate.pros, ...candidate.cons]) {
      for (const sourceUrl of reason.basisSourceUrls) {
        if (!isHttpUrl(sourceUrl)) {
          errors.push(`Candidate ${candidate.id} has an invalid reasoning source URL`);
        }
      }
    }
    for (const source of candidate.sourceLinks) {
      if (!isHttpUrl(source.url)) {
        errors.push(`Candidate ${candidate.id} has an invalid evidence URL`);
      }
    }

    if (candidate.price.completeness === "full" && !isComparableFullPrice(candidate.price)) {
      errors.push(`Candidate ${candidate.id} labels an incomplete price as full`);
    }

    if (candidate.rank !== null) {
      ranks.push(candidate.rank);
    }
  }

  ranks.sort((left, right) => left - right);
  for (const [index, rank] of ranks.entries()) {
    if (rank !== index + 1) {
      errors.push("Numeric candidate ranks must be positive and contiguous");
      break;
    }
  }

  if (!isIsoTimestamp(value.checkedAt)) {
    errors.push("Result has an invalid checkedAt timestamp");
  }

  if (value.status === "complete") {
    if (value.candidates.length === 0) {
      errors.push("A complete result must contain at least one candidate");
    }
    if (value.noMatchReasons.length > 0) {
      errors.push("A complete result cannot contain no-match reasons");
    }
  }

  if (value.status === "no_match") {
    if (value.candidates.length > 0) {
      errors.push("A no-match result cannot contain candidates");
    }
    if (value.recommendationCandidateId !== null) {
      errors.push("A no-match result cannot nominate a recommendation");
    }
    if (value.noMatchReasons.length === 0) {
      errors.push("A no-match result must explain the blocking reasons");
    }
  }

  if (value.recommendationCandidateId !== null) {
    const recommendation = value.candidates.find(
      (candidate) => candidate.id === value.recommendationCandidateId,
    );
    if (!recommendation) {
      errors.push("Recommendation must reference a returned candidate");
    } else if (!isComparableFullPrice(recommendation.price)) {
      errors.push("Recommendation must have a fully known comparable price");
    }
  }

  return { ok: errors.length === 0, errors };
}

export function assertResearchResult(value) {
  const validation = validateResearchResult(value);
  if (!validation.ok) {
    throw new Error(`Invalid research result: ${validation.errors.join("; ")}`);
  }
  return value;
}
