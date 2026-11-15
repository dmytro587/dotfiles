---
name: tracking-pr-reviews
description: Use when reviewing a GitHub pull request, or when a PR with an existing review in ./docs/task/ has new commits, replies, or resolved threads and the saved review may be stale.
---

# Tracking PR reviews

A PR review lives in `./docs/task/` as a small workspace that matches the PR's current state. The workspace shows what was reviewed, what was found, what is fixed now, and what GitHub shows.

**REQUIRED BACKGROUND:** `tracking-task-progress` (workspace rules and `progress.md`). Use `code-review` or `review` to inspect code, `pr-review-readiness` to map feedback to the diff, and `writing-review-findings` for the format of each finding.

## Two modes

| Mode | When | What you do |
|---|---|---|
| **Initial** | No saved review for this PR | Create the workspace automatically, then review. |
| **Refresh** | A saved review exists and the PR changed | Read the saved files first. Check each existing finding against the new head. Do not start a new full review. A new defect found while checking is recorded as a new finding; a broad re-review needs its own request. |

## Workspace

`progress.md` is the entry point and stays short. Review files go in `./docs/task/review/`. Each file answers one reader question and is linked from `progress.md`.

| Starting file | Answers |
|---|---|
| `pr-context.md` | What was reviewed: PRs, base and head SHAs, local changes included or excluded, goal, constraints. |
| `findings.md` | What is wrong, and the status of each finding. |
| `github-state.md` | What GitHub shows, and what was changed there with approval. |

These are defaults, not a closed list. Add a file only when a distinct question needs it and the content is real. Examples, not required names: `predecessor.md` (an earlier PR whose decisions or open findings still apply), `pr-focus.md` (the risks the review is aimed at), `validation.md` (tests or runtime observations too long for a finding). A short predecessor note stays in `pr-context.md`; one with its own unresolved findings gets a file. Do not create empty templates. A review with no findings says so.

Each fact has one home. `progress.md` summarizes; it does not copy findings.

## Findings

- Give each finding a stable ID (`F1`, `F2`). Headings may change; IDs do not.
- With several related PRs, give each finding a status per PR. A fix in one PR is not a fix in another.
- Status is one of: open, partially fixed, fixed, accepted risk, not verified.
- **Updating a finding means:** set the status and write why, naming what remains wrong, what changed, and the evidence (commit SHA, file and lines, or the check you saw). Example: "F3 partially fixed. The worker retries when the member is missing; it still skips an uncommitted re-invite shown as `rejected`. Head `abc123`, `worker.ts:174-195`. Source inspection only."
- An author's "fixed", an outdated thread, or a resolved thread is not evidence. Read the current source.
- A partial fix stays unresolved.

Track three states separately:

| State | Example |
|---|---|
| Finding status | fixed |
| GitHub state | thread still open |
| Verification | source read, no test run |

## GitHub writes need approval

- Reading GitHub is always allowed. Writing is not.
- **Never** resolve threads, edit review bodies, post comments, check boxes, approve, dismiss, or merge unless the user asks for it or approves it in this conversation. "Refresh the review" grants no write.
- When a refresh finds fixed items, record them locally and offer the GitHub changes. Then wait.
- When approved: resolve only verified fixes. Preserve the wording and nested details of a review body; add only the requested markers (for example `- [x]` or `- [ ]` before each numbered point). Read the result back from GitHub.
- Record each write in `github-state.md` with the result. A failed write is recorded as failed.

## Red flags

- Resolving a thread because it is outdated.
- Marking a finding fixed on the author's word.
- A fix on a merged PR assumed present on its follow-up PR.
- Rewriting the user's review text while adding checkboxes.
- Treating a refresh as permission to publish.
- Filling a template section that has no content.
