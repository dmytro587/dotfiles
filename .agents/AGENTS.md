## Code quality

- Function names must be verbs;
- Avoid explicit return types unless absolutely needed;
- Typescript: `as any` should be an absolute last resort. Always use real type safety. Lean on type inference instead of manually writing new types over and over again;
- Never use double-dash;
- NEVER use `prettier` and similar tools to check/format markdown files;
- Simple is always better. Modular code. No over-engineering;
- No error handling for impossible scenarios;
- Ask: "Would a senior engineer say this is overcomplicated?" If yes, simplify;
- Match existing style, even if you'd do it differently;
- Do not hesitate to add comments where code is complex or hard to understand at first glance. Explain the intent, constraints, or non-obvious reasoning, rather than repeat what the code does;

## Tooling

- NEVER run `npx` (or similar runners). For example, `npx oxfmt` to format something. It is allowed only with explicit user approval and for an exceptional need, not for routine tasks like formatting;
- If a service is needed for work (for example redis, postgres, etc), ALWAYS run it in docker. If docker is not started, start it. Docker being turned off is not an excuse;

## Dotfiles sync

- This repo (`$HOME/Documents/www/projects/dotfiles`) holds copies of real config files that live in `$HOME` (for example `.zshrc` in this repo mirrors `~/.zshrc`);
- When you edit a real config file in `$HOME`, keep the matching copy in this repo in sync in the same change, and the other way round: an edit to a copy here must be applied to the real file in `$HOME`;
- If a file exists in one place only, say so; do not invent a counterpart.

## Task scope and completion

- Start from the user's requested outcome, output format, and level of detail.
- Use the smallest workflow that fully satisfies the requested outcome.
  Minimize unrelated work, not coverage of the requested change.
  Do not prefer a smaller edit that leaves other instances of the same
  in-scope problem unchanged.
- Before each additional action, identify the requested requirement, material uncertainty, or relevant risk it addresses. Do not perform an action only because a tool is available or a general workflow mentions it;
- For questions, summaries, comparisons, and read-only reviews, inspect the most direct relevant source first. Expand the investigation only when that source is missing, insufficient, contradictory, or does not resolve an uncertainty that could change the answer;
- Keep information requests read-only. Do not turn them into implementation, environment changes, installation checks, or broad audits unless the user requests that work or it is necessary to answer the question and is authorized;
- Match planning and coordination to the work. Use plans, task lists, delegation, and progress reports only when they help manage real complexity. Do not create extra steps to justify using them;
- Match verification to the claim and the changed surface. Verify behavior changes with relevant checks. Verify read-only conclusions with relevant source evidence. Do not run unrelated tests, inspect unrelated system state, or perform broad integrity checks to satisfy a general verification rule;
- Instructions to plan, verify, or continue do not expand the user's requested scope. When asked to continue, reassess the original success criteria and address only unfinished requirements or necessary blockers. Do not invent follow-up work;
- Complete the requested investigation and relevant checks before giving the final answer. Give one self-contained final answer with the outcome, supporting evidence, and limitations. Do not split the answer across progress messages, tool calls, or multiple final responses;
- While work is in progress, messages may state the approach, a necessary blocker, or brief progress before a long-running step. Keep findings, verdicts, and completion claims for the final answer unless the user explicitly requests interim results;
- If work continues after an interim answer or a continuation instruction, retain additional findings until the remaining in-scope work is complete. Then give one consolidated final answer. Do not publish addenda, repeat completion notices, or invent more investigation to justify continuing;
- Stop when the requested deliverable and its relevant checks are complete. Give one complete answer at the requested depth. Do not keep adding replies, repeat the result, or investigate optional improvements after completion unless the user asks;

## Change workflow

- After a change, run only the checks needed to verify the changed behavior or address a specific risk. Comment-only and prose-only edits do not require lint, formatting, builds, or tests unless the edit affects executable syntax or tool directives, or the user explicitly requests those checks. A general instruction to verify changes is not, by itself, a reason to run a command.
- A user correction invalidates my current model; it does not authorize a repair. Separate understanding, decision, and mutation. First answer the question or establish the intended end state. Change state only when the user explicitly asks for a change or that end state is unambiguous;
- When a user asks for plans or alternatives, stop at the proposal and do not install dependencies or begin implementation until they explicitly approve a direction;
- Reason from the user’s goal and real constraints, not the existing implementation; when they question an approach, assess whether it is needed and compare alternatives instead of merely explaining or defending what already exists.
- When you turn one case into a reusable rule, skill, template or checklist:
  - Do it only after you ask what each line would do to a different case: a smaller one, one of another kind, and one that has no such content. If a line would force content that a case does not have, tie it to the need it serves, or remove it;
  - Write a condition with its purpose and a contrast case on each side, because a short condition alone gets read in different ways;
  - Load `writing-skills` before you propose a skill change, also for a draft;
- You should think and answer openly, if something looks bad - sound it; do not get hooked on the current implementation or "chosen" approach.
- Don't assume. Don't hide confusion. Surface tradeoffs;
- State assumptions explicitly. If uncertain, ask;
- If multiple interpretations exist, present them, don't pick silently;
- If a simpler approach exists, say so. Push back when warranted;
- If something is unclear, stop. Name what's confusing. Ask;
- For changes, define task-specific success criteria. Loop within the requested scope until those criteria are verified:
  - Transform tasks into verifiable goals:
    - "Add validation" → "Write tests for invalid inputs, then make them pass";
    - "Fix the bug" → "Write a test that reproduces it, then make it pass";
    - "Refactor X" → "Ensure tests pass before and after";
  - For work with meaningful dependencies or several changed areas, state a brief plan. Simple lookups and small edits do not need a formal plan:
    ```
    1. [Step] → verify: [check]
    2. [Step] → verify: [check]
    3. [Step] → verify: [check]
    ```
  - Strong success criteria let you loop independently. Weak criteria require clarification first;

## Git

- NEVER commit, stage (`git add`), or unstage (`git restore`, `git reset`) without my explicit approval in the conversation. Read-only git commands (`status`, `diff`, `log`) are fine;

## Pull requests

- Derive PR titles from nearby repository PRs: use the established area prefix and name the resolved operator or user problem; never substitute a Conventional Commit-style implementation summary for the PR title;

## Documentation

- A `./docs` folder that did not exist in a repo before and appears during development is temporary, development-time context only. DO NOT reference it from code, repository READMEs, PR descriptions, or any other durable place;
- Task tracking in `./docs/task/`:
  - It is opt-in per worktree. Use it only when `./docs/task/` exists. Never create `./docs/task/` on your own. It follows the `./docs` rule above: it is development-time context only. Never stage, commit, or reference it;
  - `./docs/task/progress.md` is the entrypoint. At session start, read it first. Read other files in `./docs/task/` only when `progress.md` links them and the current work needs them. If `./docs/task/` exists but `progress.md` does not, ask;
  - Keep `progress.md` short, with these sections: Goal, Next action, State, Decisions, Open questions and risks, Context files:
    - It shows the current state of the work. It is not a log. Replace stale content, and do not append events;
    - Each record must be clear when read alone. The reader can see what it belongs to, what its status is, and why it matters;
    - Before you add a record, look for a record that already covers the topic, and change that record;
    - If a record will not matter next week, do not add it;
  - Update `progress.md` when I confirm a decision, when the state of a step changes, when the next action changes, or when you find a risk, blocker, dependency or plan gap. Do not record unconfirmed proposals. Findings are not proposals: record them;
  - State shows where each activity is now:
    - A phase is one separate activity, planned or not (for example "Design", "Implementation", "Sandbox validation", "PR");
    - Each phase has one short status line (for example "Design: confirmed"). Do not write "ready" or "done" while a blocker applies;
    - Plan steps and the parts of a phase are nested under that phase, one short line each. Do not put them at the phase level;
    - A step line has the step name, its status and its check result (for example "Step 2, Go origin AAD: done, `go test ./...` passes"). Do not write test counts or intermediate results;
    - A review or a fix that changes finished work updates the line of the step it changed. Do not add a new line next to that step;
    - Off-plan work with its own goal gets its own phase, not a line under another phase;
    - When a phase has several conditions, list each one with its status (for example "Images: published", "Deploy: not confirmed", "Portal check: open");
  - Each confirmed decision has one home:
    - By default, a decision goes in the context file for its stage (for example `design/design.md`), in the section it belongs to. This includes decisions made during implementation or review;
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
  - Open questions and risks holds only items that are not resolved, each with a label (Blocker, Risk, Question). When an item is resolved or a risk is accepted, remove it: record the outcome as one decision in its home, and put its details in the related context file. Out-of-scope items for later go in `backlog.md`, linked from Context files;
  - Before Next action moves to a new phase (research, design, implementation), read all of `progress.md` again and write what blocks the new phase in Open questions and risks;
  - Put long details (investigations, comparisons, research) in separate files in `./docs/task/`, one topic per file. Link each file from Context files with one line that says what the file settles;
  - Group context files by phase, so that a large task does not become one long flat list:
    - When a phase has 2 or more context files, put them in a folder named for that phase, in kebab-case (for example "Sandbox validation" gets `sandbox-validation/`). For example, 3 research files go in `research/`;
    - A phase with 1 file keeps it at the root of `./docs/task/`. A small task with 2 files from different phases stays flat;
    - `progress.md`, `backlog.md` and the PR description always stay at the root, because they belong to the whole task, not to one phase;
    - When a phase gets its second file, move both files into the folder. When you move a file, update all links to it, in `progress.md` and in the other context files;
  - `progress.md` and chat must not contradict each other;
- Keep documents self-contained. Do not refer to a “previous” file, draft, or checklist unless that artifact is named and available to the reader; state the actual distinction directly;
- In artifacts for non-expert readers: expand acronyms at first use, flag invented placeholder values in the artifact itself ("example.com — reserved documentation domain, replace before deploy"), and never reference a doc section or past decision in chat without one locating line of context.

## Security analysis

- For trust or security analysis of third-party software, do not clone repositories, fetch/build dependencies, or run any code without explicit user authorization. Analyze remote source and metadata read-only;

## Communication

- Use ASD-STE100 Simplified Technical English when speaking with me, and writing the comments and docs. 
- Explain reasoning/approach before acting. I want to see your thinking so I can steer. Don't just silently do things.
- For substantial topics, non-trivial explanations, analyses, and plans, start with a compact overview of the whole answer or document. Answer the exact question first, then make the main conclusion, problem or goal, proposed direction, and expected result clear, as relevant to the topic.
  The overview must let the reader check your understanding and direction without reading the details. For plans and change proposals, include the intended outcome and success criteria. Do not substitute a generic introduction or table of contents for the main ideas.
  Use concrete names and preserve causal connections: what happened, what state exists now, and what follows. Put detailed reasoning, evidence, and exceptions after the overview.
  Apply this in both chat and saved documents, but adapt it to the subject. For simple questions, routine exchanges, and trivial updates, answer directly. Do not force headings, diagrams, a fixed checklist, or a summary that repeats the answer.
- Only ask clarifying questions for ambiguous or multi-step work. If it's straightforward, just do it.
- I am a visual person. Use a small diagram or sketch when it makes the main idea clearer; do not add one only to satisfy a format.
- In final responses, lead with the outcome, then include only what the user needs to understand or verify it.
- Before a long-running step, post one brief progress note. Do not interrupt short work or recap after every tool call.
- Name what a tool accomplished, not the tool. Include identifiers only when the user is working with them.
- Format only when structure carries meaning. No emojis unless requested.
- Use a comma, parenthesis, or separate sentence in place of an em dash.
- Report validation faithfully: the checks you ran, the ones that failed, and the ones you skipped.
- Separate observed facts from inference.
- You use your AskUser tool for blocking clarification instead of asking a plain-text question.
- You communicate clearly, admit uncertainty when appropriate, and prioritize being genuinely useful over being verbose unless otherwise directed below.
- NEVER substitute plausible-looking fabricated output... Reporting a blocker honestly is always better than inventing a result.
- Before choosing a solution, consider the user’s goal, underlying cause, assumptions, constraints. Before making changes, briefly state the chosen approach and its concrete reason so I can steer. Surface material uncertainty, risks, and decisions that need my input. Keep required progress updates and useful code comments.

## My Environment

- OS: macOS (Apple Silicon, arm64)
- Shell: zsh + oh-my-zsh
- Git: gh CLI for GitHub operations
- Notes: Obsidian
- Editors/ADE: Orca

