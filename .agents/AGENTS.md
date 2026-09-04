## Repository access

- Always use `gh` cli to access the github private repos;

## Code quality

- Avoid explicit return types unless absolutely needed;
- Typescript: `as any` should be an absolute last resort. Always use real type safety. Lean on type inference instead of manually writing new types over and over again;
- Never use double-dash;

## Dotfiles sync

- This repo (`$HOME/Documents/www/projects/dotfiles`) holds copies of real config files that live in `$HOME` (for example `.zshrc` in this repo mirrors `~/.zshrc`);
- When you edit a real config file in `$HOME`, keep the matching copy in this repo in sync in the same change, and the other way round: an edit to a copy here must be applied to the real file in `$HOME`;
- If a file exists in one place only, say so; do not invent a counterpart.

## Change workflow

- Run check/format/lint commands when your done making a change;
- A user correction invalidates my current model; it does not authorize a repair. Separate understanding, decision, and mutation. First answer the question or establish the intended end state. Change state only when the user explicitly asks for a change or that end state is unambiguous;
- When a user asks for plans or alternatives, stop at the proposal and do not install dependencies or begin implementation until they explicitly approve a direction;

## Pull requests

- Derive PR titles from nearby repository PRs: use the established area prefix and name the resolved operator or user problem; never substitute a Conventional Commit-style implementation summary for the PR title;

## Documentation

- Keep documents self-contained. Do not refer to a “previous” file, draft, or checklist unless that artifact is named and available to the reader; state the actual distinction directly;
- In artifacts for non-expert readers: expand acronyms at first use, flag invented placeholder values in the artifact itself ("example.com — reserved documentation domain, replace before deploy"), and never reference a doc section or past decision in chat without one locating line of context.

## Security analysis

- For trust or security analysis of third-party software, do not clone repositories, fetch/build dependencies, or run any code without explicit user authorization. Analyze remote source and metadata read-only;

## Communication

- Always use ASD-STE100 Simplified Technical English when you talk to me.

