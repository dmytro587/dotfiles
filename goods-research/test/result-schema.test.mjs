import test from "node:test";
import assert from "node:assert/strict";
import { validateResearchResult } from "../lib/result-schema.mjs";
import { completeResult, noMatchResult } from "./helpers.mjs";

test("accepts a complete result with a fully known recommendation", () => {
  assert.deepEqual(validateResearchResult(completeResult()), { ok: true, errors: [] });
});

test("accepts no-match and partial-price results without a winner", () => {
  assert.equal(validateResearchResult(noMatchResult()).ok, true);

  const partial = completeResult({ recommendationCandidateId: null });
  partial.candidates[0].price = {
    display: "$49.99 plus unknown tax",
    amount: 49.99,
    currency: "USD",
    completeness: "partial",
    components: [
      { label: "Item", display: "$49.99", known: true },
      { label: "Tax", display: "Unknown", known: false },
    ],
  };
  assert.equal(validateResearchResult(partial).ok, true);
});

test("rejects missing offers, invalid winners, noncontiguous ranks, and unavailable candidates", () => {
  const invalidRecommendation = completeResult({ recommendationCandidateId: "not-returned" });
  assert.equal(validateResearchResult(invalidRecommendation).ok, false);

  const missingOffer = completeResult();
  missingOffer.candidates[0].productUrl = "";
  assert.equal(validateResearchResult(missingOffer).ok, false);

  const ranks = completeResult();
  const second = structuredClone(ranks.candidates[0]);
  second.id = "charger-two";
  second.rank = 3;
  ranks.candidates.push(second);
  assert.equal(validateResearchResult(ranks).ok, false);

  const unavailable = completeResult();
  unavailable.candidates[0].availability.status = "out_of_stock";
  assert.equal(validateResearchResult(unavailable).ok, false);
});

test("rejects a recommendation with a partial price", () => {
  const result = completeResult();
  result.candidates[0].price.completeness = "partial";
  result.candidates[0].price.components[1].known = false;
  assert.equal(validateResearchResult(result).ok, false);
});
