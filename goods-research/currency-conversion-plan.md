# Dynamic currency conversion

## Result

Implemented generic local-market conversion. Ukraine is one delivery-country option, not a trigger.

## Flow

1. The delivery-country selector loads current ISO 4217 country and legal-currency records from SIX Group’s [Financial Data Standards page](https://www.six-group.com/en/products-services/financial-information/market-reference-data/data-standards.html).
2. The server revalidates the chosen country against the current ISO list for every local-only request.
3. One legal-tender currency: select automatically. Several: require an explicit currency choice. None: stop.
4. A foreign budget is converted with a current dated [Frankfurter](https://api.frankfurter.dev/v2/rate/USD/UAH) rate, using the ISO target-currency minor units.
5. Server stores original bounds, converted bounds, provider, rate, and date; renders them with the result and makes them Pi’s hard local-price gate.

## Failure behavior

No country currency, ambiguous currency without selection, invalid source data, or unavailable rate stops research before Pi starts. No fallback conversion.
