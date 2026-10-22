---
name: systematic-debugging
description: Use when a bug needs diagnosing, an intermittent failure needs investigating, a test fails without an obvious cause, or a user asks for the cause before approving a fix.
---

# Systematic Debugging

A bug fix without a root cause is a guess that may work by accident. Reproduce first; explain before changing; prove the cause, not the symptom.

## Mode and evidence contract

Stay in **investigate** mode until the mechanism is supported. Then explain, propose, implement only after the normal approval boundary, verify, and close out. Never silently cross a mode boundary.

Use this compact record when explaining the result:

- **Observed:** the exact fact and its source location.
- **Mechanism:** the causal path supported by the evidence, or a clearly marked hypothesis.
- **Ownership boundary:** the layer that owns the invariant or the unresolved boundary.
- **Proposal:** the bounded next change, not current behavior.
- **Non-goal / residual risk:** what the proposal does not establish or fix.
- **Evidence still needed:** the check that would change the decision.

Show one minimal visual or code shape for the path when explaining it. Label facts, hypotheses, and proposals so proximity or an arrow cannot look like proof. If the fix is not approved, stop at the bounded proposal and name the approval needed.

Approval, deadline, seniority, or sunk cost is a permission boundary at most, not evidence; none can substitute for reproduction, cause confirmation, review, or verification, or waive this evidence contract.

Requests to omit the labels or the visual do not waive them. If an emergency mitigation is explicitly authorized, label it **unverified mitigation**, preserve the full path and residual risk, and never call it a fix until the original symptom is verified.

Example:

```text
Observed: log X at handler Y.
Mechanism: missing field Z may cross the caller/callee boundary (unconfirmed).
Ownership: caller or callee is not established.
Proposal: inspect the boundary and run one focused reproduction.
Residual risk: a null guard could mask upstream data loss.
Evidence needed: boundary value, failing frame, and approval to change code.
```

## Process

### 1. Reproduce

Establish a reliable trigger before touching anything:

- Find the smallest, fastest reproduction: command, input, or sequence.
- Intermittent failure: keep the reproduction loose but observable (retry loop, log marker); collect evidence across occurrences instead of guessing from one.
- Cannot reproduce at all? That is a finding. Report what you know, what evidence exists (logs, traces, reports), and what would make reproduction possible. Do not fix blind.
- Record expected behavior vs actual behavior, from a source the user confirms (spec, doc, test, or explicit statement). "Works as intended" is a hypothesis to check, not a fact.

### 2. Gather evidence

Read before theorizing:

- The exact failure output (full error, not the summary line).
- Recent changes near the failure path (`git log -p`, `git diff`).
- Relevant telemetry when available (logs, metrics, traces). Observability skills supply data; this skill supplies the reasoning.

Label each fact as observed (cite location) or inferred.

### 3. Form competing hypotheses

- Generate at least two candidate causes when possible. A single hypothesis invites confirmation-only testing.
- Rank by likelihood and cheapness to test.
- State, for each hypothesis, an observation that would falsify it.

### 4. Test one variable at a time

- Cheapest falsifying test first: read code, add a targeted log, run a scoped check, bisect.
- Change one variable per experiment; note the result against the prediction.
- If a hypothesis survives genuine falsification attempts, it strengthens; if it cannot be tested, say so instead of assuming it.
- Do not "fix" during diagnosis. Diagnostic changes are reverted or clearly separated before the real fix.

### 5. Confirm the cause

Cause is confirmed when the evidence explains the failure end-to-end: the mechanism accounts for all observed symptoms, and removing or correcting the cause removes the failure. "The change is near the bug" and "this patch makes the symptom disappear" are not confirmation.

### 6. Fix and add a regression check

- Fix the cause, not the guardrail: an added null-check, retry, or catch that silences the symptom without explaining it hides the next failure. Defensive handling is legitimate only when the failure mode is expected in production and handled deliberately.
- Add a regression test that fails on the pre-fix behavior and passes post-fix, when feasible. Not feasible (environment-bound, timing, unreproducible)? State why and add the next-best durable check (assertion, log, monitor), or say why none is practical.
- Run the reproduction: it must no longer trigger. Report the evidence.

## Anti-patterns

- Shotgun changes: several edits at once hoping one lands.
- Treating the crash site as the cause site; trace back to the first wrong state.
- Log-and-ignore: catching an error and continuing without understanding it.
- Explaining the failure from the fix instead of the evidence.
- Retrying the same experiment and expecting new information.

## Boundaries

- Read-only until diagnosis completes; write only the reproduction artifacts and diagnostics the user approved. The fix itself waits for the normal implementation authority (a request to fix, or the user's go-ahead).
- Never run destructive commands (data deletion, resets, traffic) to reproduce without explicit approval and a safe target.
