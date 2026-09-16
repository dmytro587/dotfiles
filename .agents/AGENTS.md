## Repository access

- Always use `gh` cli to access the github private repos;

## Code quality

- Avoid explicit return types unless absolutely needed;
- Typescript: `as any` should be an absolute last resort. Always use real type safety. Lean on type inference instead of manually writing new types over and over again;
- Never use double-dash;
- NEVER use `prettier` and similar tools to check/format markdown files;

## Tooling

- NEVER run `npx` (or similar runners) for libraries not installed in the project. For example, `npx oxfmt` to format something. It is allowed only with explicit user approval and for an exceptional need, not for routine tasks like formatting;
- If a service is needed for work (for example redis, postgres, etc), ALWAYS run it in docker. If docker is not started, start it. Docker being turned off is not an excuse;

## Dotfiles sync

- This repo (`$HOME/Documents/www/projects/dotfiles`) holds copies of real config files that live in `$HOME` (for example `.zshrc` in this repo mirrors `~/.zshrc`);
- When you edit a real config file in `$HOME`, keep the matching copy in this repo in sync in the same change, and the other way round: an edit to a copy here must be applied to the real file in `$HOME`;
- If a file exists in one place only, say so; do not invent a counterpart.

## Change workflow

- Run check/format/lint commands when your done making a change;
- A user correction invalidates my current model; it does not authorize a repair. Separate understanding, decision, and mutation. First answer the question or establish the intended end state. Change state only when the user explicitly asks for a change or that end state is unambiguous;
- When a user asks for plans or alternatives, stop at the proposal and do not install dependencies or begin implementation until they explicitly approve a direction;

## Git

- NEVER commit, stage (`git add`), or unstage (`git restore`, `git reset`) without my explicit approval in the conversation. Read-only git commands (`status`, `diff`, `log`) are fine;

## Pull requests

- Derive PR titles from nearby repository PRs: use the established area prefix and name the resolved operator or user problem; never substitute a Conventional Commit-style implementation summary for the PR title;

## Documentation

- Keep documents self-contained. Do not refer to a “previous” file, draft, or checklist unless that artifact is named and available to the reader; state the actual distinction directly;
- In artifacts for non-expert readers: expand acronyms at first use, flag invented placeholder values in the artifact itself ("example.com — reserved documentation domain, replace before deploy"), and never reference a doc section or past decision in chat without one locating line of context.

## Security analysis

- For trust or security analysis of third-party software, do not clone repositories, fetch/build dependencies, or run any code without explicit user authorization. Analyze remote source and metadata read-only;

## Communication

- Use Simplified Technical English: short sentences, active voice, common words.
- In final responses, lead with the outcome, then include only what the user needs to understand or verify it.
- Before a long-running step, post one brief progress note. Do not interrupt short work or recap after every tool call.
- Name what a tool accomplished, not the tool. Include identifiers only when the user is working with them.
- Format only when structure carries meaning. No emojis unless requested.
- Use a comma, parenthesis, or separate sentence in place of an em dash.
- Report validation faithfully: the checks you ran, the ones that failed, and the ones you skipped.
- You use your AskUser tool for blocking clarification instead of asking a plain-text question.
- Use a visualization only when it materially improves understanding.
- You communicate clearly, admit uncertainty when appropriate, and prioritize being genuinely useful over being verbose unless otherwise directed below.
- NEVER substitute plausible-looking fabricated output... Reporting a blocker honestly is always better than inventing a result.

