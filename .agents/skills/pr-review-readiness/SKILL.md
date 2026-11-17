---
name: pr-review-readiness
description: Use when asked if a PR is ready for re-review or merge after feedback, before requesting review again, or to triage open review comments and requested changes against the current diff — "did we address everything?", "ready for another look?", "what's left on this PR?"
argument-hint: "<PR number or URL, or nothing for current branch>"
---

# PR Review Readiness

Audit whether review feedback is actually addressed in the current PR state. This is the **author-side** gate before re-requesting review or claiming the PR is merge-ready. It is not a code-quality review (use `code-review` for that), and it is not the reviewer's record of findings (use `tracking-pr-reviews` for that).

**Core principle:** Every piece of feedback gets an evidence-backed disposition. "I think we fixed it" is not ready.

## When to Use

- User asks if the PR is ready for review / re-review / merge after comments
- Before `@`-mentioning reviewers or clicking "Re-request review"
- After a batch of fix commits, to check that nothing was dropped
- When the PR still shows **Changes requested** or open review threads

**When NOT to use:** First review of a new PR with no feedback yet. Use `code-review` or `requesting-code-review` instead.

## Scope First

State exactly what you checked:

- PR number, title, URL, base branch, and head SHA
- Diff range: latest push on the PR branch (via `gh pr diff`), plus whether **local uncommitted** work is included or excluded
- Which feedback sources you included: review threads, top-level review bodies, issue comments on the PR

If the target PR is ambiguous, ask once. Default: current branch's open PR.

## Gather Feedback

Run the script in this skill's directory. It only reads GitHub.

```bash
scripts/fetch-pr-feedback.sh --pr PR    # omit --pr on the PR branch; --help shows all options
gh pr diff PR                           # the diff that reviewers see
```

The script prints one JSON object: `pr` (refs, head SHA, `reviewDecision`, `mergeable`), `required_checks`, `reviews` (includes CHANGES_REQUESTED bodies), `comments` (the PR conversation), and `threads` (each with `id`, `isResolved`, `isOutdated`, path, line, and comments). It reads all pages of threads. If a thread has `comments_truncated: true`, read that thread on GitHub.

**Deduplicate:** One row per **actionable** thread or review note. Merge follow-ups in the same thread into one feedback item; keep the link to the **first** comment or the thread anchor URL.

**Bots:** Include bot feedback only when it requests a concrete change (security, CI, policy). Skip pure informational bot noise unless the user cares.

## Map Feedback to Code

For each actionable item:

1. Read what was asked (quote the minimum that carries the requirement).
2. Locate the intended fix in `gh pr diff` (or local diff if in scope).
3. If the thread is **outdated**, still verify the **current** diff. Outdated often means fixed, not always.
4. If the fix is unclear from the diff alone, read the cited file at the PR head without a checkout: `git fetch origin pull/PR/head`, then `git show FETCH_HEAD:path`. Do not use `origin/HEAD`: it is the default branch, not the PR.

Use `verification-before-completion` discipline for any claim that tests or CI prove something: run or read check results, do not assume green.

## States (one of each per row)

The fix state and the thread state are separate facts, so each row has both. The fix-state words are the same as in `tracking-pr-reviews`, so the reviewer's finding and the author's row for it can be compared.

| Fix state | Meaning |
|-----------|---------|
| **fixed** | The current diff satisfies the whole ask |
| **partially fixed** | Part of the ask is done. Name what remains. It counts as not fixed |
| **open** | The ask still applies; no adequate change in scope |
| **declined** | Deliberate pushback that the reviewer has not accepted yet. Requires explicit technical or product rationale tied to this PR's goals |

| Thread state | Meaning |
|--------------|---------|
| **open** / **resolved** / **outdated** | What GitHub shows for the thread |
| **n/a** | A review body or a PR conversation comment, which has no thread |

**Evidence** is what you read: file and lines at the head SHA, a check result, or "not in diff". A thread state is never evidence.

Do not use **declined** to hand-wave discomfort. If you choose it, argue like you would in a review reply.

## Saved state

- If `./docs/task/` exists, keep the result in `./docs/task/review-feedback.md` and link it from Context files in `progress.md`. Never create `./docs/task/` for this.
  - Exception: if the folder holds a reviewer workspace (`./docs/task/review/findings.md`), you map feedback for the reviewer. Update the findings there by `tracking-pr-reviews`; do not start a second file.
- Otherwise, answer in chat only.

The file holds the scope line (PR, base, head SHA, local changes included or not), the verdict, and the disposition table. It shows the current state: replace rows, do not append rounds. Each row has a stable ID (`R1`, `R2`). An ID does not change and is not used again.

**Refresh.** When the file exists, read it first, then gather feedback again and compare the saved head SHA with the current one:

- Same SHA: add new feedback and update thread states. Do not map unchanged rows again.
- Different SHA: map again each row that is **open**, **partially fixed**, or **declined**. Map a **fixed** row again only when a file in its evidence changed (`git diff --name-only <saved SHA>..<head SHA>`), because a later commit can undo a fix. Add new feedback as new rows, then save the new SHA.

## Sub-agents (optional)

Map the items in the main session by default. Dispatch workers only for the mapping step, and only when one session would be slow: many items in separate areas of a large diff (for example backend threads and frontend threads with no shared files). A few threads in the same files stay in the main session.

- You keep gather, dedupe, the verdict, and the table.
- One worker per group of related items, not one per comment. Give each worker the PR, base and head refs, its items (summary, link, path and line), and the States tables. Do not give it the session history.
- Each worker returns table rows with evidence, plus the items it is not sure about. If two workers disagree on a row, check that row yourself.
- If the host cannot dispatch workers, map everything in the session.

## Output Format

````markdown
## PR review readiness: [title](url)

**Scope:** [diff source, base, head SHA, local included Y/N]

### Verdict: [Ready for re-review | Not ready | Ready with open discussion]

[2–5 sentences arguing the verdict. Count blockers. Mention CI/reviewDecision if relevant.
If Not ready, name the minimum set of fixes before re-requesting review.]

### Feedback disposition

| ID | Feedback (short) | Link | Fix state | Thread | Evidence | Action |
|----|------------------|------|-----------|--------|----------|--------|
| R1 | [One-line summary of what was requested] | [comment or review URL] | fixed | resolved | `file.ts:10-24` | None |
| R2 | … | … | fixed | open | … | Reply on thread summarizing fix; ask reviewer to resolve |
| R3 | … | … | partially fixed | open | … | [What remains, as a concrete fix] |
| R4 | … | … | open | resolved | not in diff | Reopen thread; implement fix or explain mistaken resolve |
| R5 | … | … | declined | open | … | Post review reply with rationale; expect reviewer pushback |

**Counts:** [N fixed, N partially fixed, N open, N declined; N threads still open]

### Checks (when merge readiness is in scope)

| Check | Result | Notes |
|-------|--------|-------|
| Required CI | pass/fail/pending | [names] |
| `reviewDecision` | … | … |
| Merge conflicts | … | … |

### Open items needing discussion

Include this section **only** when a row is **open**, **partially fixed**, or **declined** and the next step is conversation, not coding. If each gap has a clear fix in the Action column, leave the section out.

#### [R3: short title matching the table row]

- **What was asked:** …
- **Current state in diff:** … (cite file/lines or "absent")
- **Recommended move:** [implement X | split to follow-up issue | reply with rationale and ask for acceptance]
- **Draft reply (optional):** 2–4 sentences the author could post on the thread
````

The Action column and the draft replies are advice. Do not post a reply, resolve or reopen a thread, or re-request review unless the user asks for it or approves it in this conversation.

## Verdict Rules

**Ready for re-review** when:

- No row is **open** or **partially fixed**
- Every **declined** row has a defensible rationale you would actually post
- Required CI is green (or user explicitly scopes readiness to feedback-only)
- No unresolved merge conflicts

**Not ready** when any actionable feedback lacks a complete fix and lacks an agreed decision not to fix it.

**Ready with open discussion** when the only remaining rows are **declined** (or questions that need reviewer agreement) and CI/merge mechanics are otherwise fine. The author should reply on threads before re-requesting, not silently merge.

A **resolved** thread on an **open** or **partially fixed** row is the highest priority: the thread hides a gap from the reviewer.

## Integration

- After fixing **open** rows, run `verification-before-completion` on claims, then re-run this skill.
- When a fix changed behavior that the PR body states, the body is stale: use `pr-description-maker`.
- For first-pass quality review of the diff, use `code-review`.

## Red Flags

- Treating "thread resolved" as proof without reading current diff
- Ignoring **CHANGES_REQUESTED** review body because inline threads were handled
- Collapsing five distinct asks into one row
- Calling a partial fix **fixed**
- Verdict **Ready** while CI is failing on this PR
- Skipping general PR comments that contain explicit change requests
- Posting, resolving, or reopening on GitHub without approval
