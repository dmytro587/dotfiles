---
name: pr-review-readiness
description: Use when asked if a PR is ready for re-review or merge after feedback, before requesting review again, or to triage open review comments and requested changes against the current diff — "did we address everything?", "ready for another look?", "what's left on this PR?"
argument-hint: "<PR number or URL, or nothing for current branch>"
---

# PR Review Readiness

Audit whether review feedback is actually addressed in the current PR state. This is the **author-side** gate before re-requesting review or claiming the PR is merge-ready — not a code-quality review (use `code-review` for that).

**Core principle:** Every piece of feedback gets a evidence-backed disposition. "I think we fixed it" is not ready.

## When to Use

- User asks if the PR is ready for review / re-review / merge after comments
- Before `@`-mentioning reviewers or clicking "Re-request review"
- After a batch of fix commits — sanity-check nothing was dropped
- When the PR still shows **Changes requested** or open review threads

**When NOT to use:** First review of a new PR with no feedback yet — use `code-review` or `requesting-code-review` instead.

## Scope First

State exactly what you checked:

- PR number, title, URL, base branch
- Diff range: latest push on the PR branch (via `gh pr diff`), plus whether **local uncommitted** work is included or excluded
- Which feedback sources you included: review threads, top-level review bodies, issue comments on the PR

If the target PR is ambiguous, ask once. Default: current branch's open PR.

## Gather Feedback (GitHub CLI)

Run from the repo root. Replace `PR` with number or omit when on the PR branch.

### PR metadata and checks

```bash
gh pr view PR --json number,title,url,state,baseRefName,headRefName,reviewDecision,mergeable,statusCheckRollup
```

### Current diff (what reviewers will see)

```bash
gh pr diff PR
```

### Review summaries (includes CHANGES_REQUESTED)

```bash
gh pr view PR --json reviews --jq '.reviews[] | {author: .author.login, state, body, url, submittedAt}'
```

### Inline threads (resolution + outdated)

Prefer GraphQL — REST does not expose `isResolved` cleanly:

```bash
gh api graphql -f query='
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      reviewThreads(first: 100) {
        nodes {
          isResolved
          isOutdated
          comments(first: 50) {
            nodes {
              url
              body
              path
              line
              author { login }
              createdAt
            }
          }
        }
      }
    }
  }
}' -f owner=OWNER -f repo=REPO -F number=PR
```

Derive `OWNER`/`REPO` from `gh repo view --json nameWithOwner -q .nameWithOwner`.

### General PR conversation (non-inline)

```bash
gh pr view PR --json comments --jq '.comments[] | {author: .author.login, body, url, createdAt}'
```

**Deduplicate:** One row per **actionable** thread or review note. Merge follow-ups in the same thread into one feedback item; keep the link to the **first** comment or the thread anchor URL.

**Bots:** Include bot feedback only when it requests a concrete change (security, CI, policy). Skip pure informational bot noise unless the user cares.

## Sub-agents (when useful)

The coordinator (you) always owns **gather**, **dedupe**, the **verdict**, and the final **disposition table**. Sub-agents are optional workers for the **map feedback → evidence in diff** step.

**Default:** Map every item in the main session when there are roughly **≤8 actionable items**, a modest diff, or threads that mostly point at the same few files.

**Dispatch sub-agents when** mapping would be slow or context-heavy, for example:

- **Many items** — roughly **9+** distinct actionable threads or review notes
- **Large diff** — many files or packages, and each item needs reading outside the obvious hunks
- **Independent clusters** — e.g. backend vs frontend, or disjoint directory prefixes with no shared files

**Do not dispatch** for: running `gh` / GraphQL (keep that in the coordinator), a single blocking review body with one theme, or **one sub-agent per comment** (too granular; batches of **3–12 related items** per agent is enough).

**How to split work**

1. After dedupe, partition items into disjoint batches (by path prefix, subsystem, or reviewer theme).
2. For each batch, spawn **one** sub-agent in **parallel** when the host supports it (`Task` / `Agent` with a general-purpose or explore type — same pattern as `review` and `requesting-code-review`).
3. Give each worker **only** what it needs: PR URL/number, base/head refs, the batch as a bullet list (summary + link + path/line if inline), the **Status Labels** table from this skill, and either targeted `git show` paths or pasted diff hunks — **not** your full session history.
4. Require structured return: one markdown table fragment with columns **Feedback | Link | Status | Action | Evidence** (file:line or “not in diff”), plus a short list of **uncertain** items.
5. Coordinator merges fragments, resolves conflicts (two agents disagree → re-check that row yourself), applies **Verdict Rules**, and writes the full output format.

**If sub-agent dispatch is unavailable**, map everything in-session; do not simulate parallel fan-out with multiple manual passes.

**Orca:** Use `orchestration` only when the user asked for coordinated multi-agent work on the host; otherwise prefer the harness `Task`/`Agent` tool. Use `orca-cli` for ownership handoffs, not for this audit unless the user explicitly hands the PR check to another agent.

## Map Feedback to Code

For each actionable item (or each batch assigned to a sub-agent):

1. Read what was asked (quote the minimum that carries the requirement).
2. Locate the intended fix in `gh pr diff` (or local diff if in scope).
3. If the thread is **outdated**, still verify the **current** diff — outdated often means fixed, not always.
4. If the fix is unclear from diff alone, read the cited file at HEAD of the PR branch (`gh pr checkout PR` is optional; prefer `git show origin/HEAD:path` without mutating the worktree when possible).

Use `verification-before-completion` discipline for any claim that tests or CI prove something — run or read check results, do not assume green.

## Status Labels (pick exactly one per row)

| Status | Meaning |
|--------|---------|
| **Fixed and resolved** | Current diff satisfies the ask; thread resolved or comment outdated with fix still present |
| **Fixed but not resolved** | Diff satisfies the ask; thread still open — reviewer must resolve or you should reply and resolve if you have permission |
| **Not fixed and not resolved** | Ask still applies; no adequate change in scope |
| **Not fixed but resolved** | Thread marked resolved but diff does **not** meet the ask — reopen or fix (high priority) |
| **Not fixed and shouldn't be** | Deliberate pushback — requires explicit technical/product rationale tied to this PR's goals |

Do not use "shouldn't be" to hand-wave discomfort. If you choose it, argue like you would in a review reply.

## Output Format

```markdown
## PR review readiness: [title](url)

**Scope:** [diff source, base, head, local included Y/N]

### Verdict: [Ready for re-review | Not ready | Ready with open discussion]

[2–5 sentences arguing the verdict. Count blockers. Mention CI/reviewDecision if relevant.
If Not ready, name the minimum set of fixes before re-requesting review.]

### Feedback disposition

| Feedback (short) | Link | Status | Action |
|------------------|------|--------|--------|
| [One-line summary of what was requested] | [comment or review URL] | Fixed and resolved | None — optional short reply thanking reviewer |
| … | … | Fixed but not resolved | Reply on thread summarizing fix; ask reviewer to resolve |
| … | … | Not fixed and not resolved | [Concrete fix or question for author] |
| … | … | Not fixed but resolved | Reopen thread; implement fix or explain mistaken resolve |
| … | … | Not fixed and shouldn't be | Post review reply with rationale; expect reviewer pushback |

**Counts:** [N fixed+resolved, N fixed+open thread, N open gaps, N disputed]

### Checks (when merge readiness is in scope)

| Check | Result | Notes |
|-------|--------|-------|
| Required CI | pass/fail/pending | [names] |
| `reviewDecision` | … | … |
| Merge conflicts | … | … |

### Open items needing discussion

Include this section **only** when at least one row is **Not fixed and not resolved** or **Not fixed and shouldn't be** and the next step is conversation, not silent coding.

For each such item:

#### [Short title matching table row]

- **What was asked:** …
- **Current state in diff:** … (cite file/lines or "absent")
- **Recommended move:** [implement X | split to follow-up issue | reply with rationale and ask for acceptance]
- **Draft reply (optional):** 2–4 sentences the author could post on the thread

If every gap is a clear action item with no ambiguity, state "None — all open items have explicit fixes in the Action column" and omit per-item subsections.

```

## Verdict Rules

**Ready for re-review** when:

- No rows are **Not fixed and not resolved** or **Not fixed but resolved**
- Every **Not fixed and shouldn't be** has a defensible rationale you would actually post
- Required CI is green (or user explicitly scopes readiness to feedback-only)
- No unresolved merge conflicts

**Not ready** when any actionable feedback lacks a fix and lacks an agreed "shouldn't fix" decision.

**Ready with open discussion** when the only remaining rows are **Not fixed and shouldn't be** (or questions that need reviewer agreement) and CI/merge mechanics are otherwise fine — author should reply on threads before re-requesting, not silently merge.

## Integration

- After fixing **Not fixed** rows, run `verification-before-completion` on claims, then re-run this skill.
- For writing the PR body, use `pr-description-maker`; readiness audit does not replace an accurate `## Testing` section.
- For first-pass quality review of the diff, use `code-review`.

## Red Flags

- Treating "thread resolved" as proof without reading current diff
- Ignoring **CHANGES_REQUESTED** review body because inline threads were handled
- Collapsing five distinct asks into one row
- Verdict **Ready** while CI is failing on this PR
- Skipping general PR comments that contain explicit change requests
