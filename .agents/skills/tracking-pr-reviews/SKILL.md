---
name: tracking-pr-reviews
description: Use when reviewing a GitHub pull request, or when a PR with an existing review in ./docs/task/ has new commits, replies, or resolved threads and the saved review may be stale.
---

# Tracking PR reviews

A PR review lives in `./docs/task/` as a small workspace that matches the PR's current state. The workspace shows what was reviewed, what was found, what is fixed now, and what GitHub shows.

**REQUIRED BACKGROUND:** `tracking-task-progress` (workspace rules and `progress.md`). Use `code-review` or `review` to inspect code, `pr-review-readiness` in a refresh to read the threads and map them to the diff (its fix-state words match the statuses here), and `writing-review-findings` for the format of each finding.

## Review workflow

For an initial review or a requested broader re-review, establish the review basis before inspecting code for defects. A refresh continues from the saved basis rather than starting again.

1. **Understand the PR first.** Establish its intended outcome, affected behavior, constraints, and relevant sources. Read the PR and supporting requirements, callers, tests, or existing implementation as relevant. Do not invent requirements when a source is absent; record material uncertainty.
2. **Write the review criteria before reviewing.** Record what correctness means for this PR and which sources support it. Derive criteria from the actual change and its risks, not a fixed checklist copied from another PR.
3. **Review against those criteria.** Use them to direct inspection. Investigate other defects encountered within the review scope even if they are absent from the criteria; this does not authorize an unrelated repository audit.
4. **Track findings and coverage separately.** For each criterion, record whether it was checked, partly checked, or skipped, with evidence and limits. Link findings where present. No findings does not mean the criterion was checked, and source inspection does not prove runtime behavior.
5. **Write the review into the workspace, not only into chat.** Save each finding with its evidence and its recommendation, marked "Proposed". The chat answer summarizes the saved files and holds nothing that they lack.
6. **Carry context into later rounds.** Follow the Refresh mode below. Update the evidence of what you recheck, and preserve the revision of earlier evidence; do not imply unchanged areas were checked again.

Keep short criteria and coverage notes in `pr-context.md`. Use a separate linked focus file only when the detail warrants it. A small correction may need only a few lines; a substantial feature may need several criteria. For prose-only changes, check the relevant wording or instructions rather than inventing runtime behavior or mandatory tests.

## Two modes

| Mode | When | What you do |
|---|---|---|
| **Initial** | No saved review for this PR | If `./docs/task/` exists, create `review/` in it without asking, then review. If it does not exist, do not create it: review in chat with the same parts (context, criteria, coverage, findings), and say that nothing was saved. |
| **Refresh** | A saved review exists and the PR changed | Read the saved files first. Recheck findings and affected criteria within the requested scope against the new head. Do not start a new full review. A new defect found while checking is recorded as a new finding; a broad re-review needs its own request. |

To decide if a saved review is stale, compare the head SHA in `pr-context.md` with the current one (`gh pr view --json headRefOid`). If the SHA is the same, only the GitHub state can have changed: read the review bodies, threads and replies, and do not recheck the code. If it differs, the files changed between the two SHAs show which findings and criteria the new commits affect. In both cases, compare the posted review bodies with `requested-changes-comments.md`: the user can post text outside the session, and posted text leaves the file and is recorded in `github-state.md`. Save the new head SHA when the refresh is complete.

## Workspace

`progress.md` is the entry point and stays short. Review files go in `./docs/task/review/`. Each file answers one reader question and is linked from `progress.md`.

| Starting file | Answers |
|---|---|
| `pr-context.md` | What was reviewed: PRs, base and head SHAs, local changes included or excluded, goal, constraints, review criteria, and coverage. |
| `findings.md` | What is wrong, what to change, and the status of each finding. |
| `github-state.md` | What GitHub shows: the state of each requested change on the PR (open, fixed, withdrawn, or reversed in the discussion), and what was changed there with approval. |
| `requested-changes-comments.md` | The review text that is still to be posted: the review body, comments, replies, and new issues. Only when the review has text to post. |

These are defaults, not a closed list. Add a file only when a distinct question needs it and the content is real. Examples, not required names: `predecessor.md` (an earlier PR whose decisions or open findings still apply), `pr-focus.md` (the risks the review is aimed at), `validation.md` (tests or runtime observations too long for a finding). A short predecessor note stays in `pr-context.md`; one with its own unresolved findings gets a file. Do not create empty templates. A review with no findings says so.

Each fact has one home. Findings live in `findings.md`, open ones included. `progress.md` holds the status of the review as one State line with the counts (for example "Review: round 2 done, 2 open, 1 partially fixed"), and names a finding only when it blocks Next action or needs the user's decision.

## Findings

- Give each finding a stable ID (`F1`, `F2`). Headings may change; IDs do not.
- With several related PRs, give each finding a status per PR. A fix in one PR is not a fix in another.
- Status is one of: open, partially fixed, fixed, accepted risk, deferred, withdrawn. "Deferred" is a valid finding that the user chose not to request now; it stays in `findings.md` and out of `requested-changes-comments.md`. "Withdrawn" is a finding that was wrong; keep it with the reason, so a later round does not raise it again. A fix that you could not check stays open, and the reason goes in Verification.
- **Updating a finding means:** set the status and write why, naming what remains wrong, what changed, and the evidence (commit SHA, file and lines, or the check you saw). Example: "F3 partially fixed. The worker retries when the member is missing; it still skips an uncommitted re-invite shown as `rejected`. Head `abc123`, `worker.ts:174-195`. Source inspection only."
- An author's "fixed", an outdated thread, or a resolved thread is not evidence. Read the current source.
- A partial fix stays unresolved.

Track three states separately:

| State | Example |
|---|---|
| Finding status | fixed |
| GitHub state | thread still open (keep the thread URL and `id` with the finding, so a refresh and an approved resolve find it) |
| Verification | source read, no test run |

## Review comments file

`requested-changes-comments.md` mirrors the text that goes to GitHub. The PR author reads it there, without our workspace:

- Write only what the author needs to act: the location, the problem, and the request. Keep the evidence, research, rejected options, and history in `findings.md`. Contrast: a link to the code line at the pinned head belongs in the comment; a link to an outside library or a version check does not;
- Keep only items that are still to be posted. When a requested change is fixed, deferred or withdrawn, its comment is posted, or the PR discussion reverses it (for example the author and the reviewer agree on the opposite), in the same turn:
  - remove or rewrite its text here;
  - record the outcome in `findings.md` (status and reason) and in `github-state.md` (the state of that requested change on the PR);
- Give each item its target: a new review comment, a reply in an existing thread (link it), or a new issue;
- For each comment: a severity label, a location link, the problem in 1 to 3 sentences with a concrete case, then the request. Add one visual (GitHub renders Mermaid) only when it replaces reading;
- Write so that the text stays true: mark a temporary state as temporary ("today ..."), mark example numbers and configurable defaults, and link commits instead of bare SHAs;
- Do not put local bookkeeping in the file: no decision log, no "confirmed by the user", no links to `./docs`. One header line says which head the text is for;
- When a review has nothing to post (for example an approval), do not create the file.

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
- Research, history, or fixed items in `requested-changes-comments.md`.
