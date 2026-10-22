---
name: small-change
description: Proportionate workflow for a small, well-understood code change. Use when the task is a focused fix or feature with a clear definition - a one-line bug fix, a small function, a config tweak, a targeted test addition. Skip for features needing a plan or PRD, multi-file refactors, or anything requiring design decisions the user has not made.
---

# Small Change

Most changes are small. They do not need a PRD, an issue graph, or a subagent swarm; they need the relevant context, a minimum edit, and proof the change works.

## Process

### 1. Inspect the relevant path

- Read the code the change touches, its callers, and its existing tests. Understand why the current code is the way it is before changing it.
- If the change turns out not to be small (design decisions surface, the blast radius grows past a few files), stop and say so; recommend the right workflow instead of pressing on.

### 2. Identify the minimum change

- State the change in one sentence before making it. If the sentence needs "and then... and then...", it is not one small change.
- Fix the cause at its source, not the nearest symptom. No special-casing inputs to dodge a failure.
- Change only what the task needs; no drive-by refactors, no reformatting untouched lines, no dependency bumps unless that is the task.

### 3. Coverage

- Add or extend a test when the change alters behavior and a test can fail on a plausible regression of it.
- Skip the test when no meaningful automated check is feasible (pure config, copy, environment-bound behavior); say why in the report.
- Match the surrounding test conventions; do not introduce a new test framework or fixture pattern for one case.

### 4. Implement

- Make the edit. Keep diffs readable: the reviewer should see the intent from the diff alone.

### 5. Verify and stop

- Run the checks that cover the changed path (the targeted tests, type check, or lint for touched files). Full-suite runs only when that is the repo's stated bar or the user asked.
- Report: what changed, what proves it works, what was deliberately not done.
- Stop. Do not expand scope, do not start the next improvement you noticed; mention it in one line if it matters.

## Boundaries

- One task per pass. A list of small tasks gets this workflow per item, not a merged mega-change.
- Uncommitted user work near the change: leave it alone unless the task requires touching it.
- If verification fails and the cause is not quick to find, switch to the systematic-debugging method instead of iterating blindly.
