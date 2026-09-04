import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchPublicImage } from "./lib/safe-image.mjs";
import { CurrencyConversionError, addLocalBudgetConversion, listMarketCurrencies } from "./lib/budget-conversion.mjs";
import { startResearchAgent, verifyPiReadiness } from "./lib/pi-rpc.mjs";
import { validateResearchResult } from "./lib/result-schema.mjs";
import { generateReport } from "./lib/report.mjs";

const MAX_REQUEST_LENGTH = 8_000;
const MAX_OPTIONAL_LENGTH = 2_000;
const INACTIVITY_MS = 30 * 60 * 1_000;
const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
]);
const TRANSITIONS = new Map([
  ["CREATED", new Set(["RUNNING", "FAILED", "CANCELLED"])],
  ["RUNNING", new Set(["WAITING_FOR_ANSWER", "FINALIZING", "FAILED", "CANCELLED"])],
  ["WAITING_FOR_ANSWER", new Set(["RUNNING", "FAILED", "CANCELLED"])],
  ["FINALIZING", new Set(["COMPLETE", "FAILED", "CANCELLED"])],
  ["COMPLETE", new Set()],
  ["FAILED", new Set()],
  ["CANCELLED", new Set()],
]);

function defaultDataDirectory() {
  return join(process.env.HOME ?? process.cwd(), ".pi", "goods-research");
}

function serverError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function sendJson(response, status, value) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(value));
}

function sendError(response, error) {
  sendJson(response, error.status ?? 500, {
    error: error.status && error.status < 500 ? error.message : "The local research service could not complete that request.",
  });
}

function requireJsonRequest(request) {
  const contentType = request.headers["content-type"];
  if (typeof contentType !== "string" || contentType.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    throw serverError(415, "Content-Type must be application/json.");
  }
}

function expectedOrigin(port) {
  return `http://127.0.0.1:${port}`;
}

function requireSameOrigin(request, port) {
  if (request.headers.origin !== expectedOrigin(port)) {
    throw serverError(403, "This mutation must come from the local research page.");
  }
}

async function readJsonRequest(request, maxBytes = 16_384) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) {
      throw serverError(413, "The request body is too large.");
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw serverError(400, "The request body must contain JSON.");
  }
}

function parseBudgetAmount(value, name) {
  if (value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw serverError(400, `${name} must be a non-negative amount with up to two decimal places.`);
  }
  const amount = value.trim();
  if (!amount) {
    return null;
  }
  if (!/^\d+(?:\.\d{1,2})?$/.test(amount)) {
    throw serverError(400, `${name} must be a non-negative amount with up to two decimal places.`);
  }
  const parsed = Number(amount);
  if (!Number.isFinite(parsed)) {
    throw serverError(400, `${name} must be a finite amount.`);
  }
  return parsed;
}

function parseBudgetCurrency(value) {
  if (value === undefined) {
    return "";
  }
  if (typeof value !== "string") {
    throw serverError(400, "Budget currency must be a three-letter currency code.");
  }
  const currency = value.trim().toUpperCase();
  if (!currency) {
    return "";
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw serverError(400, "Budget currency must be a three-letter currency code.");
  }
  return currency;
}

function validateBrief(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw serverError(400, "The research brief must be an object.");
  }
  const allowed = new Set([
    "request",
    "deliveryMarket",
    "localMarketOnly",
    "localMarketCurrency",
    "budgetMin",
    "budgetMax",
    "budgetCurrency",
    "deadline",
    "hardRequirements",
    "preferences",
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw serverError(400, "The research brief contains an unsupported field.");
  }
  if (typeof value.request !== "string" || value.request.trim().length === 0 || value.request.length > MAX_REQUEST_LENGTH) {
    throw serverError(400, "What you are looking for is required and must be at most 8,000 characters.");
  }

  const brief = { request: value.request.trim() };
  for (const name of ["deliveryMarket", "localMarketCurrency", "deadline", "hardRequirements", "preferences"]) {
    const field = value[name];
    if (field !== undefined && (typeof field !== "string" || field.length > MAX_OPTIONAL_LENGTH)) {
      throw serverError(400, `${name} must be a string with at most 2,000 characters.`);
    }
    brief[name] = field?.trim() || "";
  }
  brief.budgetMin = parseBudgetAmount(value.budgetMin, "Minimum budget");
  brief.budgetMax = parseBudgetAmount(value.budgetMax, "Maximum budget");
  brief.budgetCurrency = parseBudgetCurrency(value.budgetCurrency);
  if ((brief.budgetMin !== null || brief.budgetMax !== null) && !brief.budgetCurrency) {
    throw serverError(400, "Budget currency is required when setting a budget range.");
  }
  if (brief.budgetMin === null && brief.budgetMax === null && brief.budgetCurrency) {
    throw serverError(400, "Set a minimum or maximum budget when providing a budget currency.");
  }
  if (brief.budgetMin !== null && brief.budgetMax !== null && brief.budgetMin > brief.budgetMax) {
    throw serverError(400, "Maximum budget must be greater than or equal to minimum budget.");
  }
  if (value.localMarketOnly !== undefined && typeof value.localMarketOnly !== "boolean") {
    throw serverError(400, "localMarketOnly must be a boolean.");
  }
  brief.localMarketOnly = value.localMarketOnly ?? false;
  if (brief.localMarketOnly && !brief.deliveryMarket) {
    throw serverError(400, "Delivery country is required when limiting research to local retailers.");
  }
  return brief;
}

function sessionToken() {
  return randomBytes(32).toString("base64url");
}

function tokenMatches(session, token) {
  if (typeof token !== "string") {
    return false;
  }
  const expected = Buffer.from(session.token);
  const actual = Buffer.from(token);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function transition(session, next) {
  if (!TRANSITIONS.get(session.state)?.has(next)) {
    throw serverError(409, `The research session cannot move from ${session.state} to ${next}.`);
  }
  session.state = next;
}

function sseMessage(event) {
  return `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

function immutableEvent(session, type, data) {
  const event = { id: ++session.eventId, type, data };
  session.events.push(event);
  if (session.events.length > 200) {
    session.events.shift();
  }
  for (const client of session.clients) {
    client.write(sseMessage(event));
  }
}

function appendImageFailure(candidate, message) {
  const reasons = [candidate.imageUnavailableReason, message].filter(Boolean);
  return { ...candidate, imageUnavailableReason: reasons.join(" ") };
}

async function cacheResultImages(result, imageDirectory, imageFetcher) {
  const assets = new Map();
  const candidates = [];
  for (const candidate of result.candidates) {
    if (!candidate.imageUrl) {
      candidates.push(candidate);
      continue;
    }
    try {
      const image = await imageFetcher(candidate.imageUrl, { cacheDir: imageDirectory });
      assets.set(candidate.imageUrl, {
        contentHash: image.contentHash,
        mimeType: image.mimeType,
        cachePath: image.cachePath,
      });
      candidates.push(candidate);
    } catch {
      candidates.push(
        appendImageFailure(
          candidate,
          "The exact product image could not be fetched safely for this catalog.",
        ),
      );
    }
  }
  return { result: { ...result, candidates }, assets };
}

function sessionPath(dataDir, sessionId) {
  return join(dataDir, "sessions", sessionId);
}

function assetForCandidate(session, candidateId) {
  const candidate = session.result?.candidates.find((item) => item.id === candidateId);
  return candidate?.imageUrl ? session.assets.get(candidate.imageUrl) ?? null : null;
}

function decorateResult(result, budgetConversion) {
  const market = { ...result.market };
  delete market.budgetConversion;
  if (budgetConversion) {
    market.budgetConversion = budgetConversion;
  }
  return { ...result, market };
}

export async function createGoodsResearchServer({
  repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  dataDir = process.env.GOODS_RESEARCH_DATA_DIR ?? defaultDataDirectory(),
  piBin = process.env.GOODS_RESEARCH_PI_BIN ?? "pi",
  port = Number(process.env.GOODS_RESEARCH_PORT ?? 4177),
  agentFactory = startResearchAgent,
  readinessCheck = verifyPiReadiness,
  imageFetcher = fetchPublicImage,
  marketLoader = listMarketCurrencies,
  budgetConverter = addLocalBudgetConversion,
} = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error("GOODS_RESEARCH_PORT must be an integer between 0 and 65535.");
  }

  const publicDirectory = join(dirname(fileURLToPath(import.meta.url)), "public");
  const indexTemplate = await readFile(join(publicDirectory, "index.html"), "utf8");
  await mkdir(join(dataDir, "sessions"), { recursive: true });
  const sessions = new Map();
  let readinessError = null;
  let boundPort = port;

  try {
    await readinessCheck({ repoRoot, dataDir, piBin });
  } catch {
    readinessError = "Pi is not ready. Confirm pi, its configured model, pi-web-access, the goods skill, and this local extension before starting research.";
  }

  function touch(session) {
    session.lastActivity = Date.now();
    clearTimeout(session.inactivityTimer);
    session.inactivityTimer = setTimeout(() => {
      if (Date.now() - session.lastActivity >= INACTIVITY_MS) {
        void cancelSession(session, "timed out");
      }
    }, INACTIVITY_MS);
  }

  async function failSession(session, message = "The research agent stopped before producing a verified catalog.") {
    if (["COMPLETE", "FAILED", "CANCELLED"].includes(session.state)) {
      return;
    }
    transition(session, "FAILED");
    immutableEvent(session, "failed", { message });
  }

  async function finalizeSession(session, result) {
    try {
      const imageDirectory = join(sessionPath(dataDir, session.id), "images");
      const cached = await cacheResultImages(result, imageDirectory, imageFetcher);
      const validation = validateResearchResult(cached.result);
      if (!validation.ok) {
        throw new Error("Image enrichment invalidated the structured research result.");
      }
      session.result = cached.result;
      session.assets = cached.assets;
      await writeFile(
        join(sessionPath(dataDir, session.id), "result.json"),
        `${JSON.stringify(session.result, null, 2)}\n`,
        "utf8",
      );
      await writeFile(
        join(sessionPath(dataDir, session.id), "images.json"),
        `${JSON.stringify([...session.assets.values()].map(({ cachePath, ...asset }) => asset), null, 2)}\n`,
        "utf8",
      );
      if (session.state !== "FINALIZING") {
        return;
      }
      transition(session, "COMPLETE");
      immutableEvent(session, "complete", { status: "complete" });
      clearTimeout(session.inactivityTimer);
    } catch {
      await failSession(session);
    }
  }

  function handleAgentEvent(session, event) {
    touch(session);
    if (event.type === "stage") {
      session.stage = event.stage;
      immutableEvent(session, "progress", { stage: event.stage });
      return;
    }
    if (event.type === "clarification") {
      if (session.clarificationCount >= 1 || session.state !== "RUNNING") {
        throw new Error("The research agent attempted an invalid clarification.");
      }
      session.clarificationCount += 1;
      transition(session, "WAITING_FOR_ANSWER");
      immutableEvent(session, "clarification", event.clarification);
      return;
    }
    if (event.type === "result") {
      if (session.state !== "RUNNING") {
        throw new Error("The research agent attempted a result outside a running session.");
      }
      const result = decorateResult(event.result, session.budgetConversion);
      const validation = validateResearchResult(result);
      if (!validation.ok) {
        throw new Error("The research agent returned an invalid structured result.");
      }
      transition(session, "FINALIZING");
      immutableEvent(session, "progress", { stage: "building-catalog" });
      void finalizeSession(session, result);
      return;
    }
    if (event.type === "error") {
      void failSession(session, event.message);
    }
  }

  async function cancelSession(session, reason = "cancelled") {
    if (["COMPLETE", "FAILED", "CANCELLED"].includes(session.state)) {
      throw serverError(409, "This research session is already finished.");
    }
    transition(session, "CANCELLED");
    clearTimeout(session.inactivityTimer);
    await session.agent?.abort();
    immutableEvent(session, "cancelled", { reason });
  }

  function findSession(id, token) {
    const session = sessions.get(id);
    if (!session) {
      throw serverError(404, "Research session not found.");
    }
    if (!tokenMatches(session, token)) {
      throw serverError(403, "The research session token is invalid.");
    }
    touch(session);
    return session;
  }

  async function startSession(brief) {
    if (readinessError) {
      throw serverError(503, readinessError);
    }
    let researchBrief;
    try {
      researchBrief = await budgetConverter(brief);
    } catch (error) {
      if (error instanceof CurrencyConversionError) {
        throw serverError(422, error.message);
      }
      throw serverError(422, "Could not verify the current local currency or exchange rate needed for this budget conversion. Retry research instead of using an unverified budget.");
    }

    const id = randomUUID();
    const session = {
      id,
      token: sessionToken(),
      state: "CREATED",
      stage: "starting",
      eventId: 0,
      events: [],
      clients: new Set(),
      agent: null,
      result: null,
      assets: new Map(),
      clarificationCount: 0,
      lastActivity: Date.now(),
      inactivityTimer: null,
      budgetConversion: researchBrief.localBudgetConversion ?? null,
    };
    await mkdir(sessionPath(dataDir, id), { recursive: true });
    sessions.set(id, session);
    transition(session, "RUNNING");
    immutableEvent(session, "progress", { stage: "starting" });
    touch(session);

    try {
      session.agent = await agentFactory({
        sessionId: id,
        brief: researchBrief,
        repoRoot,
        dataDir,
        piBin,
        onEvent: (event) => handleAgentEvent(session, event),
      });
      session.agent.done.catch(() => {
        void failSession(session);
      });
    } catch {
      await failSession(session);
      throw serverError(503, "The research agent could not be started. Check the local Pi readiness error and try again.");
    }

    return session;
  }

  async function serveStatic(request, response, pathname) {
    const target = pathname === "/" ? "/index.html" : pathname;
    const resolved = normalize(join(publicDirectory, target));
    if (!resolved.startsWith(`${publicDirectory}/`)) {
      throw serverError(404, "Not found.");
    }
    const contentType = MIME_TYPES.get(extname(resolved));
    if (!contentType) {
      throw serverError(404, "Not found.");
    }
    if (target === "/index.html") {
      const readiness = JSON.stringify(readinessError);
      response.writeHead(200, {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
        "Content-Security-Policy": "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(indexTemplate.replace("__GOODS_RESEARCH_READINESS__", readiness));
      return;
    }
    response.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    createReadStream(resolved).pipe(response);
  }

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, expectedOrigin(boundPort));
      const pathname = url.pathname;
      const segments = pathname.split("/").filter(Boolean);

      if (request.method === "GET" && pathname === "/api/markets") {
        const markets = await marketLoader();
        sendJson(response, 200, { markets });
        return;
      }

      if (request.method === "POST" && pathname === "/api/research") {
        requireJsonRequest(request);
        requireSameOrigin(request, boundPort);
        const session = await startSession(validateBrief(await readJsonRequest(request)));
        sendJson(response, 201, { sessionId: session.id, token: session.token });
        return;
      }

      if (segments[0] === "api" && segments[1] === "sessions" && segments.length >= 4) {
        const session = findSession(segments[2], url.searchParams.get("token"));
        const action = segments[3];

        if (request.method === "GET" && action === "events" && segments.length === 4) {
          response.writeHead(200, {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          });
          response.flushHeaders?.();
          session.clients.add(response);
          const previousEventId = Number(request.headers["last-event-id"] ?? 0);
          for (const event of session.events) {
            if (!Number.isFinite(previousEventId) || event.id > previousEventId) {
              response.write(sseMessage(event));
            }
          }
          request.once("close", () => session.clients.delete(response));
          return;
        }

        if (request.method === "POST" && action === "answer" && segments.length === 4) {
          requireJsonRequest(request);
          requireSameOrigin(request, boundPort);
          if (session.state !== "WAITING_FOR_ANSWER") {
            throw serverError(409, "This research session is not waiting for an answer.");
          }
          const body = await readJsonRequest(request);
          if (!body || typeof body.answer !== "string" || body.answer.trim().length === 0 || body.answer.length > MAX_OPTIONAL_LENGTH) {
            throw serverError(400, "The clarification answer is required and must be at most 2,000 characters.");
          }
          transition(session, "RUNNING");
          try {
            await session.agent.answer(body.answer.trim());
          } catch {
            await failSession(session);
            throw serverError(503, "The clarification answer could not be sent to the research agent.");
          }
          sendJson(response, 202, { status: "running" });
          return;
        }

        if (request.method === "POST" && action === "cancel" && segments.length === 4) {
          requireJsonRequest(request);
          requireSameOrigin(request, boundPort);
          await readJsonRequest(request);
          await cancelSession(session);
          sendJson(response, 202, { status: "cancelled" });
          return;
        }

        if (request.method === "GET" && action === "result" && segments.length === 4) {
          if (session.state !== "COMPLETE" || !session.result) {
            throw serverError(409, "The verified result is not available yet.");
          }
          sendJson(response, 200, session.result);
          return;
        }

        if (request.method === "GET" && action === "export" && segments.length === 4) {
          if (session.state !== "COMPLETE" || !session.result) {
            throw serverError(409, "The verified result is not available yet.");
          }
          const report = await generateReport({ result: session.result, assets: session.assets });
          response.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8",
            "Content-Disposition": `attachment; filename="goods-research-${session.id}.html"`,
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          });
          response.end(report);
          return;
        }

        if (request.method === "GET" && action === "images" && segments.length === 5) {
          const asset = assetForCandidate(session, decodeURIComponent(segments[4]));
          if (!asset || !asset.cachePath) {
            throw serverError(404, "Cached image not found.");
          }
          try {
            if (!(await stat(asset.cachePath)).isFile()) {
              throw serverError(404, "Cached image not found.");
            }
          } catch (error) {
            if (error.status === 404 || error.code === "ENOENT") {
              throw serverError(404, "Cached image not found.");
            }
            throw error;
          }
          response.writeHead(200, {
            "Content-Type": asset.mimeType,
            "Cache-Control": "private, max-age=3600",
            "X-Content-Type-Options": "nosniff",
          });
          createReadStream(asset.cachePath).pipe(response);
          return;
        }
      }

      if (request.method === "GET") {
        await serveStatic(request, response, pathname);
        return;
      }
      throw serverError(404, "Not found.");
    } catch (error) {
      if (!response.headersSent) {
        sendError(response, error);
      } else {
        response.end();
      }
    }
  });

  async function listen() {
    await new Promise((resolveListen, rejectListen) => {
      server.once("error", (error) => {
        if (error.code === "EADDRINUSE") {
          rejectListen(new Error(`Port ${port} is unavailable. Set GOODS_RESEARCH_PORT to another loopback port.`));
        } else {
          rejectListen(error);
        }
      });
      server.listen({ host: "127.0.0.1", port }, resolveListen);
    });
    boundPort = server.address().port;
    return expectedOrigin(boundPort);
  }

  async function close() {
    for (const session of sessions.values()) {
      if (!["COMPLETE", "FAILED", "CANCELLED"].includes(session.state)) {
        await cancelSession(session);
      }
      clearTimeout(session.inactivityTimer);
      for (const client of session.clients) {
        client.end();
      }
    }
    await new Promise((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
  }

  return { server, listen, close, sessions, readinessError: () => readinessError };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = await createGoodsResearchServer();
  const origin = await app.listen();
  process.stdout.write(`Goods research is available at ${origin}\n`);
}
