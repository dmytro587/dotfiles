---
name: resolve-merge-conflicts
description: Use only when the user explicitly asks to resolve merge conflicts. Do not start from conflict markers, UU status, or an in-progress merge or rebase alone.
---

# Resolve Merge Conflicts

Resolve every conflict in the working tree. Do not stage or commit. End with one decision matrix.

Run this only after an explicit request to resolve the conflicts. Conflict markers or an unfinished merge are not that request.

## When not to use

- The user wants a plan only, or tells you not to edit files.
- The conflict is not a Git conflict (two docs, two APIs, a product choice). Ask. Do not pick a side.

## Labels

| Column | Marker | Git stage | Merge | Rebase |
| --- | --- | --- | --- | --- |
| HEAD (ours) | `<<<<<<< HEAD` | `:2:` | Current branch | Upstream you rebase onto |
| Incoming (theirs) | `>>>>>>>` | `:3:` | Branch you merge in | Commit you replay |

Name the operation above the matrix. On a rebase, HEAD is the new base and Incoming is the replayed commit.

## Steps

1. List unmerged paths: `git status --short`, `git diff --name-only --diff-filter=U`, and `git ls-files -u`.
2. For each path, diff both sides against the base (`:1:` vs `:2:`, `:1:` vs `:3:`). If they disagree, read the callers, tests, or lint rule. Reading those files is enough.
3. Edit the working tree. Delete every conflict marker. Confirm the markers are gone and the paths stay unmerged (`UU`).
4. Do not lint, typecheck, format, test, start services, or run the app. Do that only if the user explicitly asks after the conflicts are resolved. Do not change tests to force a pass.

## Decision

One label per conflict hunk:

- **Combine** when each side changes a different concern. Keep both. Example: one side adds behavior. The other side adds only the blank line the repo lint requires.
- **HEAD** when the marker side matches the repo contract (types, helper, callers, tests, lint) and Incoming fights it.
- **Incoming** when the incoming edit matches that contract and the HEAD side is the stale copy.
- **Rewrite** when neither side is correct. Write the correct code. Say what you discarded.

Do not take a whole file from one side when the other side still has a real change. Do not resolve with `git checkout --ours`, `git checkout --theirs`, `git restore`, or `git reset`. Do not `git add` or commit unless the user asks.

## Report

One row per hunk. `Why` is one sentence and names the contract.

| File | Conflict | HEAD (ours) | Incoming (theirs) | Decision | Why |
| --- | --- | --- | --- | --- | --- |
| path | symbol or hunk | what this side changes | what the other side changes | Combine, HEAD, Incoming, or Rewrite | one sentence |

Then state:

- Files stay unmerged (`UU`) until the user asks you to stage them.
- If the user asked for lint, type, or tests, list what ran, failed, and skipped. Otherwise say no checks were run.
