import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function completeResult(overrides = {}) {
  const checkedAt = "2026-08-18T12:00:00.000Z";
  const result = {
    schemaVersion: 3,
    status: "complete",
    title: "Verified laptop chargers",
    requestSummary: "A compact 65 W USB-C charger for US delivery.",
    checkedAt,
    market: {
      deliveryCountry: "United States",
      deliveryRegion: null,
      currency: "USD",
      retailerScope: "delivery_eligible",
    },
    rubric: {
      hardGates: ["65 W USB-C output"],
      preferences: ["Compact"],
      assumptions: [],
    },
    recommendationCandidateId: "charger-one",
    candidates: [
      {
        id: "charger-one",
        rank: 1,
        brand: "Example",
        name: "Compact 65 W",
        variant: "Black, US plug",
        seller: "Example Store",
        productUrl: "https://shop.example.test/compact-65w",
        imageUrl: null,
        imageAlt: null,
        imageUnavailableReason: null,
        price: {
          display: "$49.99 delivered",
          amount: 49.99,
          currency: "USD",
          completeness: "full",
          components: [
            { label: "Item", display: "$49.99", known: true },
            { label: "Shipping", display: "$0", known: true },
          ],
        },
        availability: {
          status: "in_stock",
          display: "In stock",
          checkedAt,
        },
        description: "A compact USB-C charger with a folding US plug.",
        verifiedFacts: [
          {
            label: "USB-C output",
            value: "65 W",
            sourceUrl: "https://shop.example.test/compact-65w",
          },
        ],
        pros: [
          {
            text: "Meets the required output.",
            basisSourceUrls: ["https://shop.example.test/compact-65w"],
          },
        ],
        cons: [
          {
            text: "Only one USB-C port.",
            basisSourceUrls: ["https://shop.example.test/compact-65w"],
          },
        ],
        unknowns: [],
        rankingReason: "It meets the hard gate at a fully known delivered price.",
        sourceLinks: [
          { label: "Exact product offer", url: "https://shop.example.test/compact-65w" },
        ],
      },
    ],
    noMatchReasons: [],
  };
  return merge(result, overrides);
}

export function noMatchResult(overrides = {}) {
  return merge(completeResult(), {
    status: "no_match",
    recommendationCandidateId: null,
    candidates: [],
    noMatchReasons: ["No exact offer verified the required connector."],
    ...overrides,
  });
}

function merge(base, overrides) {
  const copy = structuredClone(base);
  for (const [key, value] of Object.entries(overrides)) {
    copy[key] = value;
  }
  return copy;
}

export async function temporaryDirectory(prefix = "goods-research-") {
  return mkdtemp(join(tmpdir(), prefix));
}

export async function waitFor(predicate, timeoutMs = 2_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for the expected state");
}
