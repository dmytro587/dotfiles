---
name: prd-implement
description: Implement a set of markdown issue-files (typically produced by prd-to-issues) by executing unblocked issues in parallel via subagents, and keep each issue’s task checklist accurately updated ([ ] -> [x]) only when truly done.
---

# Issues to Implementation

Implement vertical-slice issue markdown files end-to-end. Prioritize correctness, mergeability, and truthful progress tracking.

## Inputs this skill assumes

- A set of issue markdown files created from `prd-to-issues` (each file contains **Acceptance criteria** as a checklist and a **Blocked by** section).
- The user points you at either:
  - a directory that contains the issue files, or
  - a list of issue-file paths.

## Core rules

- **Truthful checklists**: only flip `- [ ]` to `- [x]` when that acceptance criterion is actually satisfied and verified.
- **Respect dependencies**: never start an issue that is blocked by another incomplete issue.
- **Parallelize safely**: use multiple subagents to implement **different unblocked issues concurrently** only when they are unlikely to touch the same files, APIs, schema, or shared modules.
- **Single source of truth**: the issue markdown files are the canonical progress record; keep them updated as work progresses.

## Process

### 1. Locate issue files

Ask the user for:

- the folder that contains the issue markdown files (preferred), or
- explicit file paths to the issues to implement.

If needed, scan the folder to enumerate all issue files.

### 2. Build an execution plan from the issue files

For each issue file, extract:

- **Title**: derive from filename or the first heading.
- **Acceptance criteria checklist**: the `- [ ] ...` items.
- **Blocked by**: parse referenced issue numbers/filenames/links, or detect “None”.

Construct a dependency graph and compute “ready” issues:

- **Ready**: `Blocked by` is “None” or all referenced blockers are complete.
- **Blocked**: at least one blocker remains incomplete.

### 3. Choose parallel work units (only for ready issues)

Group ready issues into batches that can run concurrently without stepping on each other.

Guidelines:

- Run in parallel when issues are in **different areas** (e.g., one is UI-only and another is backend-only; or two distinct endpoints).
- Run sequentially when issues share likely hotspots (same models, migrations, auth, routing, shared packages, global config).

### 4. Launch subagents for each concurrent issue

For each issue in the current ready batch, start one subagent with a clear scope:

- **Inputs**: issue file path + any referenced PRD context if present.
- **Outputs required**:
  - implemented code changes for that issue
  - evidence the acceptance criteria are satisfied (tests run, manual verification notes, screenshots if relevant)
  - a proposed update to the issue file checklist (which items to mark `[x]`, which to leave `[ ]`, and why)

Subagents must not:

- mark checkboxes as complete without verification
- start work on a blocked issue

### 5. Integrate results and update issue files

As each subagent completes:

- review the changes for conflicts with other in-flight issues
- run/verify the relevant tests or validation steps
- update the issue markdown file:
  - change only the criteria that are genuinely complete from `- [ ]` to `- [x]`
  - leave incomplete criteria as `- [ ]`
  - if acceptance criteria were ambiguous, refine them minimally but keep intent aligned with the parent PRD

### 6. Iterate until all issues are complete

Repeat:

- recompute which issues are now unblocked
- batch safe parallel work
- implement + verify + update checklists

Stop only when:

- every issue’s acceptance-criteria checklist is fully checked (`[x]`), and
- blockers are resolved consistently across files.

## Definition of “verified complete” for checklist items

An acceptance criterion can be marked `[x]` only if at least one of the following is true (prefer stronger evidence):

- a test covers it and passes
- a deterministic manual reproduction/verification path is documented and executed
- logs/outputs demonstrate correct behavior in a non-ambiguous way

If verification is not feasible in the current environment, keep it `[ ]` and add a short “How to verify” note near the criterion (do not mark it complete).
