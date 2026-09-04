import test from "node:test";
import assert from "node:assert/strict";
import { addLocalBudgetConversion, listMarketCurrencies } from "../lib/budget-conversion.mjs";

const SIX_STANDARDS_URL = "https://www.six-group.com/en/products-services/financial-information/market-reference-data/data-standards.html";
const SIX_LIST_URL = "https://www.six-group.com/list-one.xml";
const FRANKFURTER_ORIGIN = "https://api.frankfurter.dev";
const standardsPage = '<a href="/list-one.xml">List One (XML)</a>';
const listOne = `<?xml version="1.0"?>
<ISO_4217>
  <CcyTbl>
    <CcyNtry><CtryNm>UKRAINE</CtryNm><CcyNm>Hryvnia</CcyNm><Ccy>UAH</Ccy><CcyMnrUnts>2</CcyMnrUnts></CcyNtry>
    <CcyNtry><CtryNm>GERMANY</CtryNm><CcyNm>Euro</CcyNm><Ccy>EUR</Ccy><CcyMnrUnts>2</CcyMnrUnts></CcyNtry>
    <CcyNtry><CtryNm>JAPAN</CtryNm><CcyNm>Yen</CcyNm><Ccy>JPY</Ccy><CcyMnrUnts>0</CcyMnrUnts></CcyNtry>
    <CcyNtry><CtryNm>BHUTAN</CtryNm><CcyNm>Ngultrum</CcyNm><Ccy>BTN</Ccy><CcyMnrUnts>2</CcyMnrUnts></CcyNtry>
    <CcyNtry><CtryNm>BHUTAN</CtryNm><CcyNm>Indian Rupee</CcyNm><Ccy>INR</Ccy><CcyMnrUnts>2</CcyMnrUnts></CcyNtry>
    <CcyNtry><CtryNm>BOLIVIA</CtryNm><CcyNm>Boliviano</CcyNm><Ccy>BOB</Ccy><CcyMnrUnts>2</CcyMnrUnts></CcyNtry>
    <CcyNtry><CtryNm>BOLIVIA</CtryNm><CcyNm IsFund="true">Mvdol</CcyNm><Ccy>BOV</Ccy><CcyMnrUnts>2</CcyMnrUnts></CcyNtry>
    <CcyNtry><CtryNm>ANTARCTICA</CtryNm><CcyNm>No universal currency</CcyNm></CcyNtry>
  </CcyTbl>
</ISO_4217>`;

function textResponse(value) {
  return {
    ok: true,
    async text() {
      return value;
    },
  };
}

function jsonResponse(value) {
  return {
    ok: true,
    async json() {
      return value;
    },
  };
}

function conversionFetch(rates = {}) {
  const requested = [];
  return {
    requested,
    fetchImpl: async (url) => {
      requested.push(url);
      if (url === SIX_STANDARDS_URL) {
        return textResponse(standardsPage);
      }
      if (url === SIX_LIST_URL) {
        return textResponse(listOne);
      }
      if (rates[url]) {
        return jsonResponse(rates[url]);
      }
      return { ok: false };
    },
  };
}

test("loads current ISO markets without fund codes", async () => {
  const { fetchImpl } = conversionFetch();
  const markets = await listMarketCurrencies({ fetchImpl });

  assert.deepEqual(markets.find((market) => market.country === "UKRAINE"), {
    country: "UKRAINE",
    currencies: [{ code: "UAH", minorUnits: 2 }],
  });
  assert.deepEqual(markets.find((market) => market.country === "BOLIVIA"), {
    country: "BOLIVIA",
    currencies: [{ code: "BOB", minorUnits: 2 }],
  });
  assert.equal(markets.some((market) => market.country === "ANTARCTICA"), false);
});

test("converts USD to a delivery country's current local currency", async () => {
  const rateUrl = `${FRANKFURTER_ORIGIN}/v2/rate/USD/UAH`;
  const { fetchImpl, requested } = conversionFetch({
    [rateUrl]: { base: "USD", quote: "UAH", rate: 41.1234, date: "2026-08-24" },
  });

  const converted = await addLocalBudgetConversion(
    {
      deliveryMarket: "UKRAINE",
      localMarketOnly: true,
      localMarketCurrency: "",
      budgetMin: 25.5,
      budgetMax: 100,
      budgetCurrency: "USD",
    },
    { fetchImpl },
  );

  assert.deepEqual(converted.localBudgetConversion, {
    country: "UKRAINE",
    provider: "Frankfurter",
    sourceCurrency: "USD",
    sourceBudgetMin: 25.5,
    sourceBudgetMax: 100,
    targetCurrency: "UAH",
    rate: 41.1234,
    effectiveDate: "2026-08-24",
    budgetMin: 1048.65,
    budgetMax: 4112.34,
  });
  assert.deepEqual(requested, [SIX_STANDARDS_URL, SIX_LIST_URL, rateUrl]);
});

test("converts USD to EUR for another delivery country", async () => {
  const rateUrl = `${FRANKFURTER_ORIGIN}/v2/rate/USD/EUR`;
  const { fetchImpl } = conversionFetch({
    [rateUrl]: { base: "USD", quote: "EUR", rate: 0.91, date: "2026-08-24" },
  });

  const converted = await addLocalBudgetConversion(
    {
      deliveryMarket: "GERMANY",
      localMarketOnly: true,
      localMarketCurrency: "",
      budgetMin: 50,
      budgetMax: 100,
      budgetCurrency: "USD",
    },
    { fetchImpl },
  );

  assert.equal(converted.localBudgetConversion.targetCurrency, "EUR");
  assert.equal(converted.localBudgetConversion.budgetMin, 45.5);
  assert.equal(converted.localBudgetConversion.budgetMax, 91);
});

test("uses the target currency's ISO minor units", async () => {
  const rateUrl = `${FRANKFURTER_ORIGIN}/v2/rate/USD/JPY`;
  const { fetchImpl } = conversionFetch({
    [rateUrl]: { base: "USD", quote: "JPY", rate: 123.456, date: "2026-08-24" },
  });

  const converted = await addLocalBudgetConversion(
    {
      deliveryMarket: "JAPAN",
      localMarketOnly: true,
      localMarketCurrency: "",
      budgetMin: null,
      budgetMax: 1.25,
      budgetCurrency: "USD",
    },
    { fetchImpl },
  );

  assert.equal(converted.localBudgetConversion.budgetMax, 154);
});

test("does not fetch a rate when the budget already uses the local currency", async () => {
  const { fetchImpl, requested } = conversionFetch();
  const brief = {
    deliveryMarket: "GERMANY",
    localMarketOnly: true,
    localMarketCurrency: "",
    budgetMin: 25,
    budgetMax: 100,
    budgetCurrency: "EUR",
  };

  const result = await addLocalBudgetConversion(brief, { fetchImpl });

  assert.equal(result, brief);
  assert.deepEqual(requested, [SIX_STANDARDS_URL, SIX_LIST_URL]);
});

test("refuses ambiguous countries and invalid exchange rates", async () => {
  const ambiguous = conversionFetch();
  await assert.rejects(
    addLocalBudgetConversion(
      {
        deliveryMarket: "BHUTAN",
        localMarketOnly: true,
        localMarketCurrency: "",
        budgetMin: 25,
        budgetMax: null,
        budgetCurrency: "USD",
      },
      ambiguous,
    ),
    /Select a local market currency/,
  );

  const rateUrl = `${FRANKFURTER_ORIGIN}/v2/rate/USD/EUR`;
  const invalidRate = conversionFetch({
    [rateUrl]: { base: "USD", quote: "EUR", rate: 0, date: "2026-08-24" },
  });
  await assert.rejects(
    addLocalBudgetConversion(
      {
        deliveryMarket: "GERMANY",
        localMarketOnly: true,
        localMarketCurrency: "",
        budgetMin: 25,
        budgetMax: null,
        budgetCurrency: "USD",
      },
      invalidRate,
    ),
    /current exchange-rate response was invalid/,
  );

  const noCurrency = conversionFetch();
  await assert.rejects(
    addLocalBudgetConversion(
      {
        deliveryMarket: "ANTARCTICA",
        localMarketOnly: true,
        localMarketCurrency: "",
        budgetMin: 25,
        budgetMax: null,
        budgetCurrency: "USD",
      },
      noCurrency,
    ),
    /no longer available/,
  );
});
