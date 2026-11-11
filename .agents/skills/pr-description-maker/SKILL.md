---
name: pr-description-maker
description: Use when asked to write, update, or rewrite a pull request description, including a description file that several sessions or agents have edited and that reads like a work log.
---
# PR Description Creation Instructions

Write PR descriptions for reviewers, not for local implementation planning.

## Rules

- Write for a teammate. They know the product and its components, but they did not see this task, its discussions, or local docs. Before you state a change's reason, say what the affected feature is and what it is for, unless a teammate already knows it.
- For each term, ask where its meaning lives, not how technical it is:
  - The reader can learn it outside this task (for example AES-GCM, ACME, or a known service of the product): use it. Add a few words only if the PR depends on it and a teammate may not know it.
  - Its meaning exists only in this work (for example "apply", "the new flow", "this commit", or a name that sounds like a standard but comes from one internal library): explain it or replace it.
- Do not write a reference in place of a statement ("See decision 1"). The reader must not need to look elsewhere for the point of the sentence.
- If a description file already exists, rebuild it from the current diff. Do not add to it. Remove the history of the work: earlier attempts, removed tests, intermediate counts, and which session or agent ran what.
- Do not use internal phase names, local planning labels, or private implementation sequencing as substitutes for the actual changes and reasons.
- Say who or what the change affects, when the diff alone does not show it (for example, which product flow hit the error). Follow the callers until you reach that flow, including other apps in the repo.
- State a reason plainly when the change itself makes it obvious. If a reason could be wrong and a reader would rely on it, mark it as an inference or leave it out. Do not write as yourself ("my reading", "I did not").
- Describe the change at the level the reader works with: what a route, page, package, service or user sees before and after, in exact terms ("`Authorization` is not removed", not "the removal did not work"). Name these things when you first mention them, not later. Mention internals such as functions, locale keys or file paths only if the reader needs them to judge the change. Move reference material that is useful but not essential, such as a test coverage list or sample output, into a details block instead of deleting it.
- Put context in the section it explains. Do not leave a paragraph above a heading if that section only continues it.
- Before you write "always", "never", "only" or "all" about code, check every path. If you did not, name what you checked.
- Do not use vague sentences or formulations such as "improves reliability", "handles edge cases", or "adds guardrails" without explaining the affected component, exact behavior or mechanism, conditions, and observable result.
- Include the reason for the change and the new behavior. Include previous behavior, affected scope, verification, setup, and rollout details when the reader needs them to review or use the change. Describe a problem only when something is broken. A missing feature is not a bug.
- Put essential context in the PR body. Links to issues, code, documents, or discussions can support the explanation, but must not replace it.
- Exclude temporary task documents, progress files, investigation notes, and local plans from the PR description, including its change list and links, unless the user explicitly requests their inclusion. Their presence does not require an inclusion question.
- If a statement depends on configuration, use the precise configured scope. For example, say "pods in monitored namespaces" instead of "GoodKey pods" when collection is namespace-scoped.
- Add a `## Testing` section only when it tells reviewers something that they cannot see from CI: how to verify the behavior, what the tests do not cover, or what they cover, in a details block. Omit it when the available evidence is only that CI passed, or routine syntax, formatting, or diff-hygiene checks.
- A command by itself is not useful testing evidence. Include it only with the behavior it verifies and its result; do not turn incomplete local status into a PR-body checklist.
- Each result in `## Testing` must come from a run on the current diff. A result copied from an existing description or an earlier session is not evidence: run it again, mark it as not rerun, or remove it.
- Before you write that something was not run or not tested, check CI, read how the repo runs it, and run it if you can. Report the limit only if it remains. Name the exact environment and status, and do not assume them.
- Include manual verification steps when the PR changes deployed infrastructure or UI-visible behavior.
- If reviewers need credentials or internal endpoints to verify the change, document how to read the relevant secret. NEVER include secret values, tokens, or passwords in the PR body.
- When explaining a technology choice, include the real selection reason: maintainership, adoption, official or widely used references, integration value, operational tradeoff, or compatibility with existing project constraints.
- Output location:
  - If the user names an output file, write or update that file. Do not create an extra copy;
  - Otherwise, if `./docs/task/` exists, write or update `./docs/task/PR_DESCRIPTION.md`. If `./docs/task/progress.md` exists, add one line for it under Context files (for example "- [PR_DESCRIPTION.md](PR_DESCRIPTION.md): PR description for reviewers, built from the current diff"), if that line is not there yet. Never create `./docs/task/` for this;
  - Otherwise, return the PR body as Markdown in chat;
  - Drafting or updating a description file does not authorize a GitHub edit. Publish or edit the live PR body only when the user explicitly requests that action.

## How to get diff

If the source of changes is not explicit, stop and ask the user to choose one scope before reading anything:

- The remote branch against the base branch: `gh pr view`, `gh pr diff`.
- The remote branch plus local changes against the base branch: `gh pr view`, `gh pr diff`, `git diff --staged`, `git diff`.
- Only the local diff: `git diff --staged`, `git diff`.

Use exactly the scope the user picked; do not mix scopes or silently fall back to another one. When the scope includes local changes, enumerate untracked files, exclude known temporary task documents by default, and ask whether other untracked files belong in the description.

If you need structured data for the description, add `--json` to `gh pr view` and filter with `--jq`.

## Choosing the parts

There is no fixed form. Start from the diff, and ask what a reader of this PR needs to review it or understand it later. Include a part only if this PR has real content for it.

- The size follows the PR. A small, clear fix can be the issue and the fix, in a few lines.
- A small PR can still need a large part. For example, a one-line fix that chose between two non-obvious options needs its reason.
- Never invent a decision, alternative, limit, or plan to fill a part. If the PR has no real content for a part, leave it out.
- Put first what the reader needs to judge the PR. Put reference detail later, or in `<details>` blocks.
- If the PR is large, or the reasons are not clear from the diff and the context, show the user the main points and the order before the full draft. For a small, clear PR, write it.

The examples below show each side of the choice. They are not limits.

| Part | Question it answers | Use it, for example | Leave it out, for example |
|---|---|---|---|
| Opening line | Which issue is this, and what does this PR fix or add? | `Fix: #123`. For a fix with some detail, one line that says what is fixed, where, and under what condition | No issue exists, and the text below says it at once |
| Background or problem | What exists, and what is broken or missing? | The reader cannot see why the change is needed from the title | The title and one sentence already say it |
| Summary or solution | What does this PR do, and why does it matter? | Almost always, in one or two sentences | The background and fix already say it in a few lines |
| How it works | How does it behave at runtime? | The behavior is not clear from the summary | The change has no runtime behavior to explain |
| Diagram | Is there a flow to show? | Parts interact or something happens in sequence, even if the flow is not complicated. A path that changed between before and after a fix | Nothing flows, for example a changed default value. A diagram would only repeat one sentence |
| Decisions | Why this way, and not another? | A reviewer could reasonably ask for another approach, or the choice has a cost. State the reason, and the alternative and the cost if they are real | Only one reasonable way exists, or you know the behavior but not the reason. Describe the behavior under How it works, or ask the user |
| Limits | What would a reader wrongly assume that this does? | The approach leaves a lasting gap that a reader should know | Nothing here could mislead a reader. A gap that planned work closes is not a limit |
| Future work | Would knowing the plan change how the reader judges this PR? | The change looks incomplete now, a decision only makes sense because of what comes later, or code is not used yet and a known next step needs it. State intent and result, not implementation steps | We might improve it some day, and that changes nothing in how this PR reads. Never write a plan that nobody stated |
| Changes | What are the separate parts of this PR? | Several separate changes. For a fix: Background, Problem with one example, Fix. For a feature: What it adds, How it works. Use the shape in "Changes section" below | One change that the text above already describes |
| Other changes | What was done outside the task? | A refactor made along with the task | Nothing outside the task |
| Testing | What can a reviewer not see from CI? | Behavior that the tests do not cover, manual steps with their result, or a test coverage list in a details block. Put these under their own `## Testing` heading, not under another section | Only that CI passed, because the PR shows it. Also syntax, format, or `git diff --check` results, or failures that must be fixed before merge |
| Manual migrations | What must an operator do by hand? | Infra changes need follow-up. Use a todo list: each item starts with `- [ ]` and a verb | No manual follow-up |
| Notes | What else could surprise the reader? | A rollout or deployment scope note | Nothing else |

When you use a diagram, show actual runtime behavior with accurate labels, not speculative or future components. In Mermaid sequence diagrams, do not put `;` or `#` in message text: `;` ends the statement and breaks the diagram.

```md
sequenceDiagram
  participant Source as Accurate source label
  participant System as Runtime component
  Source->>System: Accurate interaction label
```

## Changes section

Make the Changes section a compact structural view, like a `/show-me` sketch. Do not write it as prose or as a file-by-file changelog. The reader must see the changed shape of the system without reading the diff.

Include only the views that help explain this PR. A view with no real change in this PR stays out: a PR that changes only an endpoint gets no file tree or component tree. Possible views:

- SQL table and endpoint contract changes, plus pseudocode for the business logic.
- Key data structure or type changes.
- A shallow file tree that shows changed responsibilities, not every touched file.
- React component tree changes, including the important hooks, state, and package boundaries.
- Call-tree, call-stack, control-flow, or data-flow changes.
- Any other structure that this PR changes and that a reviewer must see.

Prefer a `diff` block when you show a change to an existing shape.

Show the complete target shape instead when most of it is new, or when diff notation would hide which part owns what or the order of steps.

## Writing Guidance

- Do not imply wider coverage than the implementation provides.
- Keep decision rationale dense. Do not expand it with generic benefits; name the concrete reason the chosen option is better than the main alternative.
- If the PR adds a setup or rollout script, mention what it installs or changes and where it runs.
- If the PR adds UI, dashboards, or deployed infrastructure, include the access path reviewers need to inspect it.
- A failed check caused by this PR means the PR is not ready: fix it, do not describe it as a known issue. Disclose material verification limits in the body (for example, "full suite not run; auth tests pass") instead of omitting them when they affect reviewer judgment. Mention an unrelated validation failure only when it materially affects reviewer verification, and include the command, failure, and why it is unrelated.

## Final check

Read the text from the start as a reader with no notes. At each sentence, ask: from where, to what, and what is this? Fix each sentence that needs our context.

Before you finish, read each heading as the reviewer: "X of what? Why does it matter?" If a section does not answer both questions without our context, add the background. For example, "The dry run uses apply's decisions" fails: the reader does not know which dry run, what it is for, or what "apply" means.

Then ask of each part: would this reader miss it if it were gone? If not, remove it.

