---
name: verification-before-completion
description: Use when about to claim work is complete, fixed, or passing, before committing or creating PRs. Confirm evidence that is inside the user request before a success claim. This skill does not add commands, checks, or a return to earlier work.
---

# Verification Before Completion

## Overview

Claiming work is complete without verification is dishonesty, not efficiency.

**Core principle:** Evidence before claims, always.

**Violating the letter of this rule is violating the spirit of this rule.**

## Scope comes first

This section overrides the iron law, the gate, and “when to apply.”

Verification confirms a claim. It does not add work.

- The user request is the scope. A skill, a task list, or a reminder to continue does not add commands, checks, or a return to earlier work.
- A question, a review, or a correction is not permission to run commands or resume an earlier task.
- Run a command only when it is inside the request. Do not run one because this skill demands evidence.
- Do not widen one check into related commands, repeats, or parallel or background work. One long-running command at a time.
- If the request does not include a run, inspect the result and stop. Say what was not run. Do not run it to satisfy this skill.

## The Iron Law

```
NO IN-SCOPE COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

Evidence stays valid while its inputs stay unchanged. If code, config, or the relevant tests changed since the last run, re-run; otherwise a recent fresh run still counts. The command must have run in this session, not necessarily in this message.

## The Gate Function

```
BEFORE claiming any status or expressing satisfaction:

1. IDENTIFY: What command inside the request proves this claim? If the request includes none, inspect the result and stop.
2. RUN: Execute that command only (fresh, complete). Do not add related commands.
3. READ: Full output, check exit code, count failures
4. VERIFY: Does output confirm the claim?
   - If NO: State actual status with evidence
   - If YES: State claim WITH evidence
5. ONLY THEN: Make the claim

Skip any step = lying, not verifying
```

## Common Failures

| Claim | Requires | Not Sufficient |
|-------|----------|----------------|
| Tests pass | Test command output: 0 failures | Previous run, "should pass" |
| Linter clean | Linter output: 0 errors | Partial check, extrapolation |
| Build succeeds | Build command: exit 0 | Linter passing, logs look good |
| Bug fixed | Test original symptom: passes | Code changed, assumed fixed |
| Regression test works | Red-green cycle verified | Test passes once |
| Agent completed | VCS diff shows changes | Agent reports "success" |
| Requirements met | Line-by-line checklist | Tests passing |

## Red Flags - STOP

- Using "should", "probably", "seems to"
- Expressing satisfaction before verification ("Great!", "Perfect!", "Done!", etc.)
- About to commit/push/PR without verification
- Trusting agent success reports
- Relying on partial verification
- Thinking "just this once"
- Tired and wanting work over
- **ANY wording implying success without having run verification**

## Proportionality

Match the check to the claim. A targeted test supports a claim about the changed path; it does not support a claim about the whole suite. State the boundary with the result ("the auth tests pass; the full suite was not run").

Read-only review never requires mutating the worktree, reverting edits, or running project code that could have side effects. Static inspection plus stated limitations is valid evidence for read-only claims. Never revert a fix or run an unsafe script merely to satisfy a procedural rule; a mutation test belongs in an approved isolated environment.

## Rationalization Prevention

| Excuse | Reality |
|--------|---------|
| "Should work now" | RUN the verification |
| "I'm confident" | Confidence ≠ evidence |
| "Just this once" | No exceptions |
| "Linter passed" | Linter ≠ compiler |
| "Agent said success" | Verify independently |
| "I'm tired" | Exhaustion ≠ excuse |
| "Partial check is enough" | Prove the part you claim; scope the claim to the part you proved |
| "The skill says verify" | Run only what the request includes. Do not add work |
| "Different words so rule doesn't apply" | Spirit over letter |

## Key Patterns

**Tests:**
```
✅ [Run test command] [See: 34/34 pass] "All tests pass"
❌ "Should pass now" / "Looks correct"
```

**Regression tests (TDD Red-Green):**
```
✅ Write → Run (pass) → Revert fix → Run (MUST FAIL) → Restore → Run (pass) — in approved isolation, on your own change
❌ "I've written a regression test" (without red-green verification)
❌ Reverting user work or uncommitted changes to manufacture a red state
```

**Build:**
```
✅ [Run build] [See: exit 0] "Build passes"
❌ "Linter passed" (linter doesn't check compilation)
```

**Requirements:**
```
✅ Re-read plan → Create checklist → Verify each → Report gaps or completion
❌ "Tests pass, phase complete"
```

**Agent delegation:**
```
✅ Agent reports success → Check VCS diff → Verify changes → Report actual state
❌ Trust agent report
```

## Why This Matters

From 24 failure memories:
- your human partner said "I don't believe you" - trust broken
- Undefined functions shipped - would crash
- Missing requirements shipped - incomplete features
- Time wasted on false completion → redirect → rework
- Violates: "Honesty is a core value. If you lie, you'll be replaced."

## When To Apply

**Before an in-scope completion claim:**
- A success claim about work the user asked you to change or run
- Committing, PR creation, or handing that work off

**Do not use this skill to:**
- Answer a question by running commands
- Resume earlier work after the user says to stop, or says to answer only
- Start extra, parallel, or background commands

**Rule applies to:**
- Exact phrases
- Paraphrases and synonyms
- Implications of success
- ANY communication suggesting completion/correctness

**Scope limits:**
- Evidence must match claim scope; qualify partial evidence instead of suppressing it
- Never run unauthorized or unsafe project code, and never revert work, just to satisfy this rule

## The Bottom Line

**No shortcuts for an in-scope check. No extra checks to satisfy this skill.**

If the request includes a run, run that command, read the output, then claim the result. If it does not, inspect the result and stop.
