import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { buildPiArguments, createJsonlDecoder, startResearchAgent } from "../lib/pi-rpc.mjs";
import { completeResult, temporaryDirectory } from "./helpers.mjs";

class FakePiChild extends EventEmitter {
  constructor(onCommand) {
    super();
    this.stdin = new PassThrough();
    this.stdout = new PassThrough();
    this.stderr = new PassThrough();
    this.killed = false;
    this.stdin.setEncoding("utf8");
    let remainder = "";
    this.stdin.on("data", (chunk) => {
      remainder += chunk;
      let index;
      while ((index = remainder.indexOf("\n")) !== -1) {
        const line = remainder.slice(0, index);
        remainder = remainder.slice(index + 1);
        onCommand(JSON.parse(line), this);
      }
    });
  }

  kill() {
    if (!this.killed) {
      this.killed = true;
      queueMicrotask(() => this.emit("exit", 0));
    }
    return true;
  }
}

function writeRecord(child, record) {
  child.stdout.write(`${JSON.stringify(record)}\n`);
}

test("keeps U+2028 and U+2029 inside strict LF-delimited JSONL records", () => {
  const records = [];
  const errors = [];
  const decoder = createJsonlDecoder({
    onRecord: (record) => records.push(record),
    onError: (error) => errors.push(error),
  });
  decoder.push('{"text":"first ');
  decoder.push('second third"}\r\n');
  decoder.push('{"value":2}\n');
  decoder.end();

  assert.deepEqual(records, [{ text: "first second third" }, { value: 2 }]);
  assert.deepEqual(errors, []);
});

test("uses fixed Pi arguments and continues one session after a clarification", async () => {
  const dataDir = await temporaryDirectory();
  const events = [];
  let promptCount = 0;
  let firstPrompt;
  const spawnImpl = () => new FakePiChild((command, child) => {
    if (command.type !== "prompt") {
      return;
    }
    firstPrompt ??= command.message;
    promptCount += 1;
    writeRecord(child, { type: "response", id: command.id, command: "prompt", success: true });
    if (promptCount === 1) {
      writeRecord(child, { type: "agent_start" });
      writeRecord(child, {
        type: "tool_execution_end",
        toolName: "request_goods_clarification",
        isError: false,
        result: {
          details: {
            question: "Which delivery country applies?",
            reason: "The winning offer depends on delivery.",
            suggestedAnswers: ["United States"],
          },
        },
      });
      writeRecord(child, { type: "agent_settled" });
      return;
    }
    writeRecord(child, {
      type: "tool_execution_end",
      toolName: "submit_goods_research",
      isError: false,
      result: { details: completeResult() },
    });
  });

  const agent = await startResearchAgent({
    sessionId: "session-one",
    brief: {
      request: "Find a compact 65 W charger.",
      deliveryMarket: "GERMANY",
      localMarketOnly: true,
      budgetMin: 50,
      budgetMax: 100,
      budgetCurrency: "USD",
      localBudgetConversion: {
        country: "GERMANY",
        provider: "Frankfurter",
        sourceCurrency: "USD",
        sourceBudgetMin: 50,
        sourceBudgetMax: 100,
        targetCurrency: "EUR",
        rate: 0.91,
        effectiveDate: "2026-08-24",
        budgetMin: 45.5,
        budgetMax: 91,
      },
    },
    repoRoot: process.cwd(),
    dataDir,
    piBin: "fake-pi",
    onEvent: (event) => events.push(event),
    spawnImpl,
  });
  await agent.answer("United States");
  await agent.done;

  assert.equal(promptCount, 2);
  assert.equal(events.find((event) => event.type === "clarification").clarification.question, "Which delivery country applies?");
  assert.deepEqual(events.find((event) => event.type === "result").result, completeResult());
  assert.match(firstPrompt, /Retailer scope: Only retailers based in the delivery country/);
  assert.match(firstPrompt, /retailers demonstrably based in the named delivery country/);
  assert.match(firstPrompt, /Budget: USD 50 to 100/);
  assert.match(firstPrompt, /converted local budget: EUR 45.5 to 91 \(Frankfurter USD\/EUR rate 0.91, effective 2026-08-24\)/);
  assert.match(firstPrompt, /server-verified converted local budget is a hard price gate/);
  const args = buildPiArguments({ sessionId: "session-one", repoRoot: process.cwd(), dataDir });
  assert.match(args[args.indexOf("--tools") + 1], /^web_search,fetch_content,get_search_content,inspect_product_image,request_goods_clarification,submit_goods_research$/);
});

test("rejects an agent that settles without a terminal structured tool", async () => {
  const dataDir = await temporaryDirectory();
  const events = [];
  const spawnImpl = () => new FakePiChild((command, child) => {
    if (command.type === "prompt") {
      writeRecord(child, { type: "response", id: command.id, command: "prompt", success: true });
      setTimeout(() => writeRecord(child, { type: "agent_settled" }), 0);
    }
  });
  const agent = await startResearchAgent({
    sessionId: "session-two",
    brief: { request: "Find a charger." },
    repoRoot: process.cwd(),
    dataDir,
    piBin: "fake-pi",
    onEvent: (event) => events.push(event),
    spawnImpl,
  });
  await assert.rejects(agent.done, /settled without a clarification or final result/);
  assert.match(
    events.find((event) => event.type === "error").message,
    /permission gate permits the configured research tools/,
  );
});

test("maps incompatible permission gate tool failures without exposing raw tool output", async () => {
  const dataDir = await temporaryDirectory();
  const events = [];
  const spawnImpl = () => new FakePiChild((command, child) => {
    if (command.type === "prompt") {
      writeRecord(child, { type: "response", id: command.id, command: "prompt", success: true });
      setTimeout(() => {
        writeRecord(child, {
          type: "tool_execution_end",
          toolName: "request_goods_clarification",
          isError: true,
          result: {
            content: [{ type: "text", text: "Permission gate supports Pi 0.83.0; this runtime is 0.84.1." }],
          },
        });
      }, 0);
    }
  });
  const agent = await startResearchAgent({
    sessionId: "session-three",
    brief: { request: "Find a charger." },
    repoRoot: process.cwd(),
    dataDir,
    piBin: "fake-pi",
    onEvent: (event) => events.push(event),
    spawnImpl,
  });
  await assert.rejects(agent.done, /tool failed/);
  assert.equal(
    events.find((event) => event.type === "error").message,
    "The installed Pi permission gate is incompatible with this Pi runtime. Update the permission gate, then start a new research request.",
  );
});

test("lets Pi recover from a non-terminal web tool failure", async () => {
  const dataDir = await temporaryDirectory();
  const events = [];
  const spawnImpl = () => new FakePiChild((command, child) => {
    if (command.type !== "prompt") {
      return;
    }
    writeRecord(child, { type: "response", id: command.id, command: "prompt", success: true });
    writeRecord(child, {
      type: "tool_execution_end",
      toolName: "web_search",
      isError: true,
      result: { content: [{ type: "text", text: "Temporary upstream error" }] },
    });
    writeRecord(child, {
      type: "tool_execution_end",
      toolName: "submit_goods_research",
      isError: false,
      result: { details: completeResult() },
    });
  });
  const agent = await startResearchAgent({
    sessionId: "session-four",
    brief: { request: "Find a charger." },
    repoRoot: process.cwd(),
    dataDir,
    piBin: "fake-pi",
    onEvent: (event) => events.push(event),
    spawnImpl,
  });
  await agent.done;
  assert.deepEqual(events.find((event) => event.type === "result").result, completeResult());
});
