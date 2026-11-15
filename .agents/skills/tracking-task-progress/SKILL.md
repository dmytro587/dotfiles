---
name: tracking-task-progress
description: Use when the current worktree has a `./docs/task/` folder, at session start, and before you read or change `progress.md` or other files in `./docs/task/`.
---

# Tracking task progress in `./docs/task/`

`./docs/task/` is development-time context only. Never create it, never stage or commit it, and never reference it from durable places.

## Entry point

- `./docs/task/progress.md` is the entrypoint. At session start, read it first. Read other files in `./docs/task/` only when `progress.md` links them and the current work needs them. If `./docs/task/` exists but `progress.md` does not, ask;

## `progress.md`

- Keep `progress.md` short, with these sections: Goal, Next action, State, Decisions, Open questions and risks, Context files:
  - It shows the current state of the work. It is not a log. Replace stale content, and do not append events;
  - Each record must be clear when read alone. The reader can see what it belongs to, what its status is, and why it matters;
  - Before you add a record, look for a record that already covers the topic, and change that record;
  - If a record will not matter next week, do not add it;
- Update `progress.md` when I confirm a decision, when the state of a step changes, when the next action changes, or when you find a risk, blocker, dependency or plan gap. Do not record unconfirmed proposals. Findings are not proposals: record them;
  - When the state of a step changes, read all of `progress.md` in the same turn, not only the line you change. A one-line edit leaves the other records that the same change affects out of date;
  - Remove an open item that the step answered, after you write its outcome in its home (for example "Question: does the importer accept empty files?" after the import step passed with empty files). Keep an item that still applies after the step (for example "Risk: a rollback needs a manual image copy" after a rollout step);
  - Update every other file in `./docs/task/` that tracks the same step, for example a checklist in `PR_DESCRIPTION.md`: tick its box, do not delete the item;
  - Keep the State line of the finished step with its result. These updates change statuses; they do not delete the record of finished work;
- When a finding changes the task outcome or verification, preserve the affected behavior, triggering condition, observed result, supporting evidence, and relation to the current change. The next reader must understand what remains unresolved, not just see a label such as "legacy issue". If the cause, relation, or whether the change addresses it is unknown, say so;
  - Keep the short status in `progress.md` and the supporting detail in an existing relevant linked context file. Create a separate file only when the Context files rules call for one;
  - For example, explain how a new retry path exposes old queue records when that blocks rollout. A completed wording correction with no finding needs no findings section or new context file;
- State shows where each activity is now:
  - A phase is one separate activity, planned or not (for example "Design", "Implementation", "Sandbox validation", "PR");
  - Each phase has one short status line (for example "Design: confirmed"). Do not write "ready" or "done" while a blocker applies;
  - Plan steps and the parts of a phase are nested under that phase, one short line each. Do not put them at the phase level;
  - A step line has the step name, its status and its check result (for example "Step 2, Go origin AAD: done, `go test ./...` passes"). Do not write test counts or intermediate results;
  - A review or a fix that changes finished work updates the line of the step it changed. Do not add a new line next to that step;
  - Off-plan work with its own goal gets its own phase, not a line under another phase;
  - When a phase has several conditions, list each one with its status (for example "Images: published", "Deploy: not confirmed", "Portal check: open");

## Decisions

- Each confirmed decision has one home:
  - By default, a decision goes in the context file for its stage (for example `design.md`, or `design/design.md` when the design phase has 2 or more files), in the section it belongs to. This includes decisions made during implementation or review;
  - A decision goes in `progress.md` Decisions, at any level, only if it meets one of these tests:
    - It limits what we claim to users, or accepts a risk;
    - It limits the scope of the whole task (for example "change code only in this repo"). A single parameter or feature that we did not build is not a scope limit;
    - It affects several stages or components;
    - Undoing it would cause harm, and the code does not show that it was deliberate;
  - Before you add a decision to `progress.md`, name the test it meets. If no test clearly fits, use the context file;
  - These tests are guidance. If I ask to keep a decision in `progress.md`, it stays there;
  - One decision per record: if one part can change while the other stays true, split the record. A reason or a detail of the same choice stays in the record;
  - When a decision changes, replace the record. Do not add a second record;
  - Group the records under labeled subheadings when the list is long, from high level to low level;
  - Values that change with each build or run (versions in use, digests, generated hashes) are facts, not decisions. Put them in a context file;

## Open questions and phase changes

- Open questions and risks holds only items that are not resolved, each with a label (Blocker, Risk, Question). When an item is resolved or a risk is accepted, remove it: record the outcome as one decision in its home, and put its details in the related context file. Out-of-scope items for later go in `backlog.md`, linked from Context files;
- Before Next action moves to a new phase (research, design, implementation, or a rollout to the next environment), read all of `progress.md` again and write what blocks the new phase in Open questions and risks;

## Context files

- Put long details (investigations, comparisons, research) in separate files in `./docs/task/`, one topic per file. Link each file from Context files with one line that says what the file settles;
- Group context files by phase, so that a large task does not become one long flat list:
  - When a phase has 2 or more context files, put them in a folder named for that phase, in kebab-case (for example "Sandbox validation" gets `sandbox-validation/`). For example, 3 research files go in `research/`;
  - A phase with 1 file keeps it at the root of `./docs/task/`. A small task with 2 files from different phases stays flat;
  - `progress.md`, `backlog.md` and `PR_DESCRIPTION.md` always stay at the root, because they belong to the whole task, not to one phase;
  - When a phase gets its second file, move both files into the folder. When you move a file, update all links to it, in `progress.md` and in the other context files;
- `progress.md` and chat must not contradict each other;
