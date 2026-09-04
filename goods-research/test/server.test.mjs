import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { createGoodsResearchServer } from "../server.mjs";
import { CurrencyConversionError } from "../lib/budget-conversion.mjs";
import { completeResult, temporaryDirectory, waitFor } from "./helpers.mjs";

function headers(origin) {
  return { origin, "content-type": "application/json" };
}

async function startServer(agentFactory, options = {}) {
  const app = await createGoodsResearchServer({
    repoRoot: resolve(process.cwd(), ".."),
    dataDir: await temporaryDirectory(),
    port: 0,
    readinessCheck: async () => {},
    agentFactory,
    ...options,
  });
  const origin = await app.listen();
  return { app, origin };
}

test("streams a clarification, resumes the same local session, persists a result, and exports it", async () => {
  let answerCount = 0;
  const agentFactory = async ({ onEvent }) => {
    let resolveDone;
    const done = new Promise((resolveDonePromise) => {
      resolveDone = resolveDonePromise;
    });
    queueMicrotask(() => {
      onEvent({ type: "stage", stage: "researching-category" });
      onEvent({
        type: "clarification",
        clarification: {
          question: "Which delivery market applies?",
          reason: "Delivery changes the verified offer.",
          suggestedAnswers: ["United States"],
        },
      });
    });
    return {
      done,
      async answer(answer) {
        answerCount += 1;
        assert.equal(answer, "United States");
        onEvent({ type: "stage", stage: "verifying-offers" });
        onEvent({ type: "result", result: completeResult() });
        resolveDone();
      },
      async abort() {
        resolveDone();
      },
    };
  };
  const { app, origin } = await startServer(agentFactory);

  try {
    const page = await fetch(origin);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /goods-research-readiness/);

    const invalidOrigin = await fetch(`${origin}/api/research`, {
      method: "POST",
      headers: headers("http://example.invalid"),
      body: JSON.stringify({ request: "Find a compact charger." }),
    });
    assert.equal(invalidOrigin.status, 403);

    const started = await fetch(`${origin}/api/research`, {
      method: "POST",
      headers: headers(origin),
      body: JSON.stringify({ request: "Find a compact charger." }),
    });
    assert.equal(started.status, 201);
    const { sessionId, token } = await started.json();
    const session = app.sessions.get(sessionId);
    await waitFor(() => session.state === "WAITING_FOR_ANSWER");

    const events = await fetch(`${origin}/api/sessions/${sessionId}/events?token=${encodeURIComponent(token)}`);
    assert.equal(events.status, 200);
    const reader = events.body.getReader();
    const firstEvent = await reader.read();
    assert.match(new TextDecoder().decode(firstEvent.value), /clarification/);
    await reader.cancel();

    const noToken = await fetch(`${origin}/api/sessions/${sessionId}/result`);
    assert.equal(noToken.status, 403);

    const answered = await fetch(`${origin}/api/sessions/${sessionId}/answer?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: headers(origin),
      body: JSON.stringify({ answer: "United States" }),
    });
    assert.equal(answered.status, 202);
    await waitFor(() => session.state === "COMPLETE");
    assert.equal(answerCount, 1);

    const result = await fetch(`${origin}/api/sessions/${sessionId}/result?token=${encodeURIComponent(token)}`);
    assert.equal(result.status, 200);
    assert.equal((await result.json()).recommendationCandidateId, "charger-one");

    const exported = await fetch(`${origin}/api/sessions/${sessionId}/export?token=${encodeURIComponent(token)}`);
    assert.equal(exported.status, 200);
    assert.match(await exported.text(), /catalog-search/);

    const completeCancel = await fetch(`${origin}/api/sessions/${sessionId}/cancel?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: headers(origin),
      body: "{}",
    });
    assert.equal(completeCancel.status, 409);
  } finally {
    await app.close();
  }
});

test("cancels a running child and allows a clean replacement request", async () => {
  let aborted = 0;
  const agentFactory = async ({ onEvent }) => {
    let resolveDone;
    const done = new Promise((resolveDonePromise) => {
      resolveDone = resolveDonePromise;
    });
    queueMicrotask(() => onEvent({ type: "stage", stage: "searching-candidates" }));
    return {
      done,
      async answer() {},
      async abort() {
        aborted += 1;
        resolveDone();
      },
    };
  };
  const { app, origin } = await startServer(agentFactory);

  try {
    const start = async () => {
      const response = await fetch(`${origin}/api/research`, {
        method: "POST",
        headers: headers(origin),
        body: JSON.stringify({ request: "Find a compact charger." }),
      });
      assert.equal(response.status, 201);
      return response.json();
    };
    const first = await start();
    const cancelled = await fetch(`${origin}/api/sessions/${first.sessionId}/cancel?token=${encodeURIComponent(first.token)}`, {
      method: "POST",
      headers: headers(origin),
      body: "{}",
    });
    assert.equal(cancelled.status, 202);
    assert.equal(app.sessions.get(first.sessionId).state, "CANCELLED");
    assert.equal(aborted, 1);

    const second = await start();
    assert.notEqual(second.sessionId, first.sessionId);
    await fetch(`${origin}/api/sessions/${second.sessionId}/cancel?token=${encodeURIComponent(second.token)}`, {
      method: "POST",
      headers: headers(origin),
      body: "{}",
    });
  } finally {
    await app.close();
  }
});

test("requires a delivery country for local retailer searches and passes the scope to the agent", async () => {
  let receivedBrief;
  const agentFactory = async ({ brief }) => {
    receivedBrief = brief;
    let resolveDone;
    const done = new Promise((resolveDonePromise) => {
      resolveDone = resolveDonePromise;
    });
    return {
      done,
      async answer() {},
      async abort() {
        resolveDone();
      },
    };
  };
  const { app, origin } = await startServer(agentFactory, { budgetConverter: async (brief) => brief });

  try {
    const missingMarket = await fetch(`${origin}/api/research`, {
      method: "POST",
      headers: headers(origin),
      body: JSON.stringify({ request: "Find a compact charger.", localMarketOnly: true }),
    });
    assert.equal(missingMarket.status, 400);
    assert.match((await missingMarket.json()).error, /Delivery country is required/);

    const invalidScope = await fetch(`${origin}/api/research`, {
      method: "POST",
      headers: headers(origin),
      body: JSON.stringify({ request: "Find a compact charger.", deliveryMarket: "Canada", localMarketOnly: "true" }),
    });
    assert.equal(invalidScope.status, 400);
    assert.match((await invalidScope.json()).error, /localMarketOnly must be a boolean/);

    const started = await fetch(`${origin}/api/research`, {
      method: "POST",
      headers: headers(origin),
      body: JSON.stringify({ request: "Find a compact charger.", deliveryMarket: "Canada", localMarketOnly: true }),
    });
    assert.equal(started.status, 201);
    const { sessionId, token } = await started.json();
    assert.equal(receivedBrief.deliveryMarket, "Canada");
    assert.equal(receivedBrief.localMarketOnly, true);

    const cancelled = await fetch(`${origin}/api/sessions/${sessionId}/cancel?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: headers(origin),
      body: "{}",
    });
    assert.equal(cancelled.status, 202);
  } finally {
    await app.close();
  }
});

test("validates and normalizes the numeric budget range before starting research", async () => {
  let receivedBrief;
  const agentFactory = async ({ brief }) => {
    receivedBrief = brief;
    let resolveDone;
    const done = new Promise((resolveDonePromise) => {
      resolveDone = resolveDonePromise;
    });
    return {
      done,
      async answer() {},
      async abort() {
        resolveDone();
      },
    };
  };
  const { app, origin } = await startServer(agentFactory);

  try {
    const missingCurrency = await fetch(`${origin}/api/research`, {
      method: "POST",
      headers: headers(origin),
      body: JSON.stringify({ request: "Find a compact charger.", budgetMin: "25" }),
    });
    assert.equal(missingCurrency.status, 400);
    assert.match((await missingCurrency.json()).error, /Budget currency is required/);

    const invertedRange = await fetch(`${origin}/api/research`, {
      method: "POST",
      headers: headers(origin),
      body: JSON.stringify({
        request: "Find a compact charger.",
        budgetMin: "100",
        budgetMax: "25",
        budgetCurrency: "USD",
      }),
    });
    assert.equal(invertedRange.status, 400);
    assert.match((await invertedRange.json()).error, /Maximum budget must be greater than or equal/);

    const started = await fetch(`${origin}/api/research`, {
      method: "POST",
      headers: headers(origin),
      body: JSON.stringify({
        request: "Find a compact charger.",
        budgetMin: "25.50",
        budgetMax: "100",
        budgetCurrency: "eur",
      }),
    });
    assert.equal(started.status, 201);
    const { sessionId, token } = await started.json();
    assert.equal(receivedBrief.budgetMin, 25.5);
    assert.equal(receivedBrief.budgetMax, 100);
    assert.equal(receivedBrief.budgetCurrency, "EUR");

    const cancelled = await fetch(`${origin}/api/sessions/${sessionId}/cancel?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: headers(origin),
      body: "{}",
    });
    assert.equal(cancelled.status, 202);
  } finally {
    await app.close();
  }
});

test("passes a generic local budget conversion to the research agent", async () => {
  let converterBrief;
  let agentBrief;
  const conversion = {
    country: "GERMANY",
    provider: "Frankfurter",
    sourceCurrency: "USD",
    sourceBudgetMin: 50,
    sourceBudgetMax: 100,
    targetCurrency: "EUR",
    rate: 0.9,
    effectiveDate: "2026-08-24",
    budgetMin: 45,
    budgetMax: 90,
  };
  const agentFactory = async ({ brief }) => {
    agentBrief = brief;
    let resolveDone;
    const done = new Promise((resolveDonePromise) => {
      resolveDone = resolveDonePromise;
    });
    return {
      done,
      async answer() {},
      async abort() {
        resolveDone();
      },
    };
  };
  const { app, origin } = await startServer(agentFactory, {
    budgetConverter: async (brief) => {
      converterBrief = brief;
      return { ...brief, localBudgetConversion: conversion };
    },
  });

  try {
    const started = await fetch(`${origin}/api/research`, {
      method: "POST",
      headers: headers(origin),
      body: JSON.stringify({
        request: "Find a compact charger.",
        deliveryMarket: "GERMANY",
        localMarketOnly: true,
        localMarketCurrency: "",
        budgetMin: "50",
        budgetMax: "100",
        budgetCurrency: "USD",
      }),
    });
    assert.equal(started.status, 201);
    const { sessionId, token } = await started.json();
    assert.equal(converterBrief.budgetCurrency, "USD");
    assert.equal(converterBrief.budgetMin, 50);
    assert.deepEqual(agentBrief.localBudgetConversion, conversion);

    const cancelled = await fetch(`${origin}/api/sessions/${sessionId}/cancel?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: headers(origin),
      body: "{}",
    });
    assert.equal(cancelled.status, 202);
  } finally {
    await app.close();
  }
});

test("refuses local research when its budget conversion cannot be verified", async () => {
  let agentStarted = false;
  const { app, origin } = await startServer(
    async () => {
      agentStarted = true;
      throw new Error("The agent must not start without a verified conversion.");
    },
    {
      budgetConverter: async () => {
        throw new CurrencyConversionError("Select a local market currency for this delivery country.");
      },
    },
  );

  try {
    const response = await fetch(`${origin}/api/research`, {
      method: "POST",
      headers: headers(origin),
      body: JSON.stringify({
        request: "Find a compact charger.",
        deliveryMarket: "GERMANY",
        localMarketOnly: true,
        budgetMax: "100",
        budgetCurrency: "USD",
      }),
    });
    assert.equal(response.status, 422);
    assert.match((await response.json()).error, /Select a local market currency/);
    assert.equal(agentStarted, false);
  } finally {
    await app.close();
  }
});

test("serves live market choices and preserves server-owned conversion metadata", async () => {
  const conversion = {
    country: "GERMANY",
    provider: "Frankfurter",
    sourceCurrency: "USD",
    sourceBudgetMin: 50,
    sourceBudgetMax: 100,
    targetCurrency: "EUR",
    rate: 0.9,
    effectiveDate: "2026-08-24",
    budgetMin: 45,
    budgetMax: 90,
  };
  const markets = [{ country: "GERMANY", currencies: [{ code: "EUR", minorUnits: 2 }] }];
  const agentFactory = async ({ onEvent }) => {
    let resolveDone;
    const done = new Promise((resolveDonePromise) => {
      resolveDone = resolveDonePromise;
    });
    queueMicrotask(() => {
      onEvent({ type: "result", result: completeResult() });
      resolveDone();
    });
    return {
      done,
      async answer() {},
      async abort() {
        resolveDone();
      },
    };
  };
  const { app, origin } = await startServer(agentFactory, {
    marketLoader: async () => markets,
    budgetConverter: async (brief) => ({ ...brief, localBudgetConversion: conversion }),
  });

  try {
    const marketResponse = await fetch(`${origin}/api/markets`);
    assert.equal(marketResponse.status, 200);
    assert.deepEqual((await marketResponse.json()).markets, markets);

    const started = await fetch(`${origin}/api/research`, {
      method: "POST",
      headers: headers(origin),
      body: JSON.stringify({
        request: "Find a compact charger.",
        deliveryMarket: "GERMANY",
        localMarketOnly: true,
        budgetMin: "50",
        budgetMax: "100",
        budgetCurrency: "USD",
      }),
    });
    assert.equal(started.status, 201);
    const { sessionId, token } = await started.json();
    await waitFor(() => app.sessions.get(sessionId).state === "COMPLETE");

    const result = await fetch(`${origin}/api/sessions/${sessionId}/result?token=${encodeURIComponent(token)}`);
    assert.equal(result.status, 200);
    assert.deepEqual((await result.json()).market.budgetConversion, conversion);
  } finally {
    await app.close();
  }
});
