# Goods Research

Local web application for evidence-backed product research. It starts a constrained Pi research session, applies the repository's `researching-goods` rubric, and returns a validated product catalog instead of a search-result list.

## What it does

- Collects a product request plus delivery country, a currency-qualified minimum and maximum budget range, deadline, hard requirements, and preferences. A local-retailer-only option excludes cross-border marketplaces and sellers without a verified presence in the selected country.
- For local-only research, the application derives the country’s current ISO 4217 currency and converts a foreign budget range with a current, dated Frankfurter rate before the agent begins. It stops rather than guessing when the country has no unambiguous currency or the rate cannot be verified.
- Asks at most one clarification, only when an unanswered hard gate could change the result.
- Requires direct product pages, exact variants, current availability, and complete or explicitly partial prices before a candidate can be returned.
- Preserves unknowns rather than inferring product attributes.
- Retrieves and validates only exact candidate images for visual requirements.
- Streams progress to the browser, displays the verified catalog, caches returned images locally, and exports a standalone HTML report.

The UI and HTTP server bind only to `127.0.0.1`.

## Requirements

- Node.js 24 or newer.
- A working `pi` CLI with a configured model.
- Pi web access and the repository's `.agents/skills/researching-goods` skill available to Pi.

The server checks Pi readiness at startup. If the check fails, the UI remains available but refuses to start research and reports the missing runtime prerequisites.

## Run locally

```sh
npm ci
npm start
```

Open `http://127.0.0.1:4177`.

The default storage directory is `~/.pi/goods-research`. Override runtime paths when needed:

```sh
GOODS_RESEARCH_PORT=4180 npm start
GOODS_RESEARCH_DATA_DIR=/path/to/data npm start
GOODS_RESEARCH_PI_BIN=/path/to/pi npm start
```

Each session expires after 30 minutes without activity. Completed session data includes the structured result, image metadata, and cached product images.

## Research workflow

1. Describe the product need and provide every known hard requirement. Set the optional minimum and maximum budget in one currency to make the price constraint unambiguous. For domestic retailers, select a delivery country and enable the local-retailer-only option. If that country has multiple current legal-tender currencies, select the applicable one.
2. Answer the single clarification only if the agent identifies a winner-changing unknown.
3. Wait for the verified catalog. Candidates include direct offers, evidence, tradeoffs, pricing state, availability, and explicit unknowns.
4. Download the standalone report when the result is complete.

A candidate that lacks a verified exact offer, required variant, or availability is not returned as a recommendation. A partial price remains partial rather than being treated as a confirmed total.

## HTTP API

The browser UI uses the local API below. Session-scoped requests require the `token` returned by `POST /api/research`.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/research` | Start a session with the research brief. |
| `GET` | `/api/markets` | Retrieve current ISO 4217 delivery-country and legal-currency choices. |
| `GET` | `/api/sessions/:id/events?token=:token` | Receive session progress and the optional clarification over Server-Sent Events. |
| `POST` | `/api/sessions/:id/answer?token=:token` | Submit the clarification answer. |
| `POST` | `/api/sessions/:id/cancel?token=:token` | Cancel an active session. |
| `GET` | `/api/sessions/:id/result?token=:token` | Retrieve the verified structured result. |
| `GET` | `/api/sessions/:id/export?token=:token` | Download the completed standalone HTML report. |
| `GET` | `/api/sessions/:id/images/:candidateId?token=:token` | Serve a cached candidate image. |

All mutating requests must be JSON and originate from the local application origin.

## Development

```sh
npm run check
npm test
```

`npm run check` performs JavaScript syntax checks, including the TypeScript Pi extension. `npm test` runs the Node test suite for the server, Pi RPC bridge, catalog schema, report generation, and safe image handling.

## Project layout

- `server.mjs` — local HTTP server, session lifecycle, static assets, exports, and image caching.
- `lib/pi-rpc.mjs` — Pi RPC startup, readiness, progress, clarification, and result handling.
- `pi-extension.ts` — Pi tools for exact-image inspection, the single clarification, and structured result submission.
- `lib/result-schema.mjs` — result contract validation.
- `lib/safe-image.mjs` — image-fetch validation and safe local caching.
- `lib/report.mjs` — standalone report generation.
- `public/` — browser interface and catalog renderer.
- `test/` — Node test suite.
