---
name: system-exploration
description: Neutral, evidence-backed explanation of how a system works. Use when the user asks to explain, trace, or map how a system, request path, module, or data flow works - without redesigning, reviewing, or proposing changes. Skip when the user wants fixes or architecture recommendations.
---

# System Exploration

Explain what is, not what should be. The output leaves the reader able to reason about the system, without steering them toward a redesign.

## Method

### 1. Frame the question

Restate what needs explaining and at what depth: a request path end-to-end, one module's responsibilities, a data flow, or the whole system's shape. Ask only if the frame is unclear; otherwise infer and state the frame you chose.

### 2. Trace from entry points

- Find where the flow enters (route, CLI command, queue consumer, cron) and follow it through to the effect (response, write, message).
- At each hop, name the component, its responsibility, and the artifact that proves it (file + symbol, config key, schema).
- Prefer executable truth over documentation: the code and config are the source; docs are a claim to verify against them.

### 3. Establish the load-bearing facts

- **State ownership**: which component owns which data or state; where it persists; who may mutate it.
- **Invariants**: rules the code maintains (uniqueness, ordering, atomicity), and where they are enforced.
- **Dependencies**: what the flow calls out to (services, DBs, queues, caches) and what happens when each is unavailable, as far as the code shows.
- **Unknowns and open questions**: mark explicitly ("unclear whether X retries on timeout — did not find the retry config"). Never fill an unknown with a plausible guess.

### 4. Report

Structure the explanation around the flow, not the file tree:

1. One-paragraph answer first: the direct path from cause to effect.
2. The detailed walkthrough: ordered steps, each with its source location.
3. State, invariants, and external dependencies as separate short sections when they matter.
4. Open questions and unknowns, labeled.

Cite source locations for every load-bearing claim. When source conflicts with docs or with the user's belief, report the code's behavior and note the conflict; do not silently pick a side.

## Hard boundaries

- **No changes.** Read-only. No edits, no TODO comments, no config, no tests, no glossary updates. Findings that suggest changes go in the report as observations, at most.
- **No redesign.** Noting fragility ("single point of failure here") is in scope; proposing the new architecture is out.
- **Honest depth.** Report what the evidence supports; label inference. A shallow-but-true map beats a deep-but-partly-invented one.
