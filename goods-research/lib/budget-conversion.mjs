import { XMLParser } from "fast-xml-parser";

const SIX_STANDARDS_URL = "https://www.six-group.com/en/products-services/financial-information/market-reference-data/data-standards.html";
const FRANKFURTER_ORIGIN = "https://api.frankfurter.dev";
const REQUEST_TIMEOUT_MS = 5_000;
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  trimValues: true,
});

export class CurrencyConversionError extends Error {}

function conversionError(message) {
  return new CurrencyConversionError(message);
}

function asArray(value) {
  return Array.isArray(value) ? value : value === undefined ? [] : [value];
}

function text(value) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function listOneUrl(page) {
  for (const anchor of page.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    if (!/List One \(XML\)/i.test(anchor[2])) {
      continue;
    }
    const href = anchor[1].match(/\bhref=(["'])([^"']+)\1/i);
    if (href) {
      return new URL(href[2].replaceAll("&amp;", "&"), SIX_STANDARDS_URL).toString();
    }
  }
  throw conversionError("The current ISO currency list could not be located.");
}

function parseMarkets(document) {
  let parsed;
  try {
    parsed = parser.parse(document);
  } catch {
    throw conversionError("The current ISO currency list was invalid.");
  }
  const entries = asArray(parsed?.ISO_4217?.CcyTbl?.CcyNtry);
  const markets = new Map();
  for (const entry of entries) {
    const country = text(entry.CtryNm);
    const currency = text(entry.Ccy);
    const currencyName = entry.CcyNm;
    const minorUnits = Number(text(entry.CcyMnrUnts));
    if (
      !country ||
      !/^[A-Z]{3}$/.test(currency) ||
      (typeof currencyName === "object" && currencyName["@IsFund"] === "true") ||
      !Number.isInteger(minorUnits) ||
      minorUnits < 0 ||
      minorUnits > 6
    ) {
      continue;
    }
    const market = markets.get(country) ?? { country, currencies: [] };
    if (!market.currencies.some((item) => item.code === currency)) {
      market.currencies.push({ code: currency, minorUnits });
    }
    markets.set(country, market);
  }
  if (markets.size === 0) {
    throw conversionError("The current ISO currency list contained no usable markets.");
  }
  return [...markets.values()]
    .map((market) => ({
      ...market,
      currencies: market.currencies.sort((left, right) => left.code.localeCompare(right.code)),
    }))
    .sort((left, right) => left.country.localeCompare(right.country));
}

async function fetchResponse(fetchImpl, url, accept) {
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { Accept: accept },
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw conversionError("The current currency source could not be reached.");
  }
  if (!response.ok) {
    throw conversionError("The current currency source is unavailable.");
  }
  return response;
}

async function fetchMarkets(fetchImpl) {
  const standards = await fetchResponse(fetchImpl, SIX_STANDARDS_URL, "text/html");
  let page;
  try {
    page = await standards.text();
  } catch {
    throw conversionError("The current currency source was invalid.");
  }
  const list = await fetchResponse(fetchImpl, listOneUrl(page), "application/xml,text/xml");
  let document;
  try {
    document = await list.text();
  } catch {
    throw conversionError("The current ISO currency list was invalid.");
  }
  return parseMarkets(document);
}

function hasBudgetBound(brief) {
  return Number.isFinite(brief.budgetMin) || Number.isFinite(brief.budgetMax);
}

function roundMoney(amount, minorUnits) {
  const scale = 10 ** minorUnits;
  return Math.round((amount + Number.EPSILON) * scale) / scale;
}

function targetCurrency(markets, brief) {
  const market = markets.find((item) => item.country === brief.deliveryMarket);
  if (!market) {
    throw conversionError("The selected delivery country is no longer available in the current ISO currency list.");
  }
  if (market.currencies.length === 1) {
    return market.currencies[0];
  }
  if (!brief.localMarketCurrency) {
    throw conversionError("Select a local market currency for this delivery country.");
  }
  const selected = market.currencies.find((item) => item.code === brief.localMarketCurrency);
  if (!selected) {
    throw conversionError("The selected local market currency is not valid for this delivery country.");
  }
  return selected;
}

async function fetchRate(fetchImpl, sourceCurrency, targetCurrency) {
  const response = await fetchResponse(
    fetchImpl,
    `${FRANKFURTER_ORIGIN}/v2/rate/${sourceCurrency}/${targetCurrency}`,
    "application/json",
  );
  let rate;
  try {
    rate = await response.json();
  } catch {
    throw conversionError("The current exchange-rate response was invalid.");
  }
  if (
    rate?.base !== sourceCurrency ||
    rate.quote !== targetCurrency ||
    !Number.isFinite(rate.rate) ||
    rate.rate <= 0 ||
    typeof rate.date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(rate.date)
  ) {
    throw conversionError("The current exchange-rate response was invalid.");
  }
  return rate;
}

export async function listMarketCurrencies({ fetchImpl = fetch } = {}) {
  return fetchMarkets(fetchImpl);
}

export async function addLocalBudgetConversion(brief, { fetchImpl = fetch } = {}) {
  if (!brief.localMarketOnly) {
    return brief;
  }
  const currency = targetCurrency(await fetchMarkets(fetchImpl), brief);
  if (!hasBudgetBound(brief) || brief.budgetCurrency === currency.code) {
    return brief;
  }
  const rate = await fetchRate(fetchImpl, brief.budgetCurrency, currency.code);
  return {
    ...brief,
    localBudgetConversion: {
      country: brief.deliveryMarket,
      provider: "Frankfurter",
      sourceCurrency: brief.budgetCurrency,
      sourceBudgetMin: brief.budgetMin,
      sourceBudgetMax: brief.budgetMax,
      targetCurrency: currency.code,
      rate: rate.rate,
      effectiveDate: rate.date,
      budgetMin: Number.isFinite(brief.budgetMin)
        ? roundMoney(brief.budgetMin * rate.rate, currency.minorUnits)
        : null,
      budgetMax: Number.isFinite(brief.budgetMax)
        ? roundMoney(brief.budgetMax * rate.rate, currency.minorUnits)
        : null,
    },
  };
}
