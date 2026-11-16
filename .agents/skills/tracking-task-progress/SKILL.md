---
name: tracking-task-progress
description: Use when the current worktree has a `./docs/task/` folder, at session start, and before you read or change `progress.md` or other files in `./docs/task/`.
---

# Tracking task progress in `./docs/task/`

`./docs/task/` is development-time context only. Never create it, never stage or commit it, and never reference it from durable places.

## Entry point

- `./docs/task/progress.md` is the entrypoint. At session start, read it first. Read other files in `./docs/task/` only when `progress.md` links them and the current work needs them. If `./docs/task/` exists but `progress.md` does not, ask;

## `progress.md`

- Keep `progress.md` short, with these sections: Goal, Next action, State, Decisions, Known risks, Open questions and risks, Context files. Known risks and Open questions and risks can be empty:
  - It shows the current state of the work. It is not a log. Replace stale content, and do not append events;
  - Each record must be clear when read alone. The reader can see what it belongs to, what its status is, and why it matters;
  - Put what the reader needs first: the conclusion or outcome, then who decided it, then the reason and the evidence. For example, an accepted risk starts with what we accept ("a removed teammate keeps access for up to 8 hours"), not with how the mechanism works. A record whose first words already are the conclusion (for example "Direction: option 3") needs no change;
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
    - It limits what we claim to users;
    - It accepts a risk. The record goes in Known risks, not in Decisions;
    - It limits the scope of the whole task (for example "change code only in this repo"). A single parameter or feature that we did not build is not a scope limit;
    - It affects several stages or components;
    - Undoing it would cause harm, and the code does not show that it was deliberate;
  - Before you add a decision to `progress.md`, name the test it meets. If no test clearly fits, use the context file;
  - These tests are guidance. If I ask to keep a decision in `progress.md`, it stays there;
  - One decision per record: if one part can change while the other stays true, split the record. A reason or a detail of the same choice stays in the record;
  - When a decision changes, replace the record. Do not add a second record;
  - When the list is long, group the records as a nested list, from high level to low level: a top-level item names the group (for example "- Infrastructure:"), and the group's records are nested under it. Do not use Markdown headings (`###`) for groups, because headings split one section of `progress.md` into many small sections. A short list (for example 4 records) stays flat; a list of 10 records from several areas gets groups;
  - A temporary decision holds only until a step or an event in this task, for example "only the user's account runs until the deploy check passes". Put it in a "Temporary:" group at the top of Decisions, and end the record with "Until: <step or event>". If you cannot name that step or event, ask; do not write "for now" without one:
    - When its step or event happens, remove the record. Write the result in that step's State line, or, if the decision stays true, move it to its normal group without "Until";
    - A settled decision has no "for now" and no "Until". If nothing in this task will reopen a decision (for example "no bought domain" when the task never needs a public name), it is settled; write it without "for now";
    - A task with no temporary decisions has no "Temporary:" group;
  - Values that change with each build or run (versions in use, digests, generated hashes) are facts, not decisions. Put them in a context file;

## Known risks

- Known risks holds the risks that need no action now, so that Open questions and risks shows only what needs action. Group the records by type as a nested list, so the reader sees the type before the records: a top-level item names the group ("- Mitigated:" or "- Accepted by the user:"), and the group's records are nested under it. Leave out a group that has no records:
  - Mitigated: "<risk>. Mitigation: <phase or step>" for a risk that can still happen after a mitigation I confirmed: the mitigation lowers its chance or its effect, or gives a recovery path (for example "a broken Tailscale blocks SSH; recovery: reopen port 22 in the security list"). Keep it while it can still happen;
  - Accepted by the user: "<what we accept, with its limit>. <why it happens, and the evidence>" for a risk that I accepted. The group name shows who accepted it, so the record does not repeat it. This record is the decision; do not copy it to Decisions;
- When a confirmed mitigation removes the risk (for example "secrets limited to `main`" makes "every branch can read the secrets" impossible), it is not a known risk. Write the mitigation as a decision in its home, for example a line nested under its plan step in State, or the context file for its stage, ending with "Why: prevents <risk>". Then remove the risk. If part of the risk stays after the mitigation, record that part as Mitigated or Accepted by the user;
- A fix that you suggested but I did not confirm does not move a risk here. That risk stays in Open questions and risks, also when its text already names the fix;
- A risk with a confirmed mitigation stays in Open questions and risks while that mitigation has open checks that can change it (for example, a fix that depends on a test of which commands still work). Nest those checks under the risk, so that one topic has one record. When no open check is left (for example, "the testing-dev rollout goes first" has no check that can change it), move the risk to Mitigated or into its plan step, by the rules above;

## Open questions and phase changes

- Open questions and risks holds only items that need action or my decision, each with a label (Blocker, Risk, Question). A Risk here has no confirmed mitigation and is not accepted:
  - When an item is resolved, remove it: record the outcome as one decision in its home, and put its details in the related context file;
  - When I confirm a mitigation step or accept a risk, move the risk as the Known risks rules say: to Known risks, or into its plan step when the mitigation removes it. A risk whose mitigation still has open checks stays here;
  - Out-of-scope items for later go in `backlog.md`, linked from Context files;
- When I ask to close the open items, work on every item in Open questions and risks, Risks included, not only the Questions. A Risk needs my decision: present the options and their effects, and ask;
- Before Next action moves to a new phase (research, design, implementation, or a rollout to the next environment), read all of `progress.md` again and write what blocks the new phase in Open questions and risks:
  - For each Risk in Open questions and risks, ask whether it changes the work of the new phase. If yes, ask me to decide it before the phase starts (for example, a credential risk that changes the access design). If no, leave it there (for example, a production rollout risk during design);

## Context files

- Put long details (investigations, comparisons, research) in separate files in `./docs/task/`, one topic per file. Link each file from Context files with one line that says what the file settles;
- Group context files by phase, so that a large task does not become one long flat list:
  - When a phase has 2 or more context files, put them in a folder named for that phase, in kebab-case (for example "Sandbox validation" gets `sandbox-validation/`). For example, 3 research files go in `research/`;
  - A phase with 1 file keeps it at the root of `./docs/task/`. A small task with 2 files from different phases stays flat;
  - `progress.md`, `backlog.md` and `PR_DESCRIPTION.md` always stay at the root, because they belong to the whole task, not to one phase;
  - When a phase gets its second file, move both files into the folder. When you move a file, update all links to it, in `progress.md` and in the other context files;
- `progress.md` and chat must not contradict each other;
