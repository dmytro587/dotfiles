## Purpose and structure

This repository is the agent-facing guide for a personal dotfiles repo. Its original purpose is macOS environment setup: mirrored home-directory config files (`~/.zshrc` -> `.zshrc`, plus `.bashrc`, `.ghostty`, `Brewfile`, `.kube_config_example`), and setup scripts (`bootstrap.sh`, `ssh.sh`, `github_setup.sh`). Every mirrored file here has a real counterpart in `$HOME`; keep both sides in sync in one change (see `.agents/AGENTS.md`).

Layout:

- Mirrored config files and setup/helper scripts at the repo root (`sync_claude_md_across_projects.sh`).
- `.agents/` — agent configuration, skills, and agent workflow rules (including this file's sync and communication rules).
- `.pi/`, `.omp/` — agent harness configs (Pi permission gate, artifacts, gotchas, plugins, mcp's).
- `docs/` — design papers, verification reports, and implementation plans.
- `goods-research/` — Node.js goods-research service (server, Pi extension, tests, scripts).
- `k9s/` — k9s plugins config.
- `topics/` — private Obsidian workspace; not public documentation; see "Private topics routing" below.

## Private topics routing

- `topics/` is the local-only Obsidian workspace. It is not public repository documentation and must not be staged, committed, or pushed.
- A request that explicitly names `topics/`, a private topic, the personal workspace, Obsidian research, or the LLM Wiki activates private-workspace routing.
- Before reading a private topic file, read `topics/AGENTS.md` and `topics/HOME.md`. The vault contract is authoritative for that task.
- For unrelated public repository work, do not read `topics/`.
- When a launcher can choose a working directory, start private-workspace sessions in `topics/` or the named topic directory so the vault contract is discovered automatically.

## Agent dot-folder name convention

- Agent dot-folders (`.pi/`, `.omp/`) configure exactly one agent each. Never place another agent's configuration inside them;
- Inside an agent dot-folder, an entry is a mirror file when its name and path match the agent's native structure in `$HOME` (example: `.omp/agent/mcp.json` mirrors `~/.omp/agent/mcp.json`). Bootstrap copies mirror files to the same relative path under `$HOME`;
- `_bootstrap/` inside an agent dot-folder is repo-only: declarations and installer scripts read from the repository. Bootstrap runs it and never copies it to `$HOME`;
- Do not track agent runtime state in this repo (lockfiles, `node_modules`, caches, sessions), even when the folder name matches the agent's native structure. The agent owns those files at runtime;
- Local OMP plugins are declared in `.omp/_bootstrap/plugins.json` and linked with `omp plugin link` (see `.omp/README.md`). Never hardcode plugins in bootstrap scripts and never write `~/.omp/plugins` lockfiles or symlinks by hand.

## ./.agents

- Do not invent new sections when updating the AGENTS.md.



&nbsp;