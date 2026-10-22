# Dotfiles polishing

Goal: one clone of this repository and one bootstrap run set up a new Mac with the same environment as the current Mac. Special focus: Orca, OMP (Oh My Pi) and Claude Code.

This file is the working document for the task. It holds findings, proposals, decisions and progress. Update the status boxes when a step is done.

Review date: 2026-10-22. All findings come from a read-only comparison of this repository with the live `$HOME` of the current Mac.

## Summary

- The repository cannot set up a new Mac as it is now. `bootstrap.sh` stops early at three or more points (see "Bootstrap blockers").
- Much of the real Claude Code, OMP and Orca setup exists only in `$HOME` and not in the repository.
- Some repository copies are older than the live files. A bootstrap run on the current Mac would overwrite newer OMP configuration with older copies.
- `topics/` is small (2.8 MB, 281 files). AirDrop is enough to move it, but zip it first.
- All 19 required apps and agent CLIs have a verified official install source. Use the casks named in "Required software". The plain `orca` cask is a different app, so do not use it.
- The new Mac also needs a fixed folder layout and a clone and build of `parrot`.

## Safety rule for installation

Priority: safety. Each install source must pass these checks, in this order:

1. A cask in the official `homebrew/cask` tap, and its download URL is on the vendor's own domain or the vendor's own GitHub organization.
2. If there is no such cask: a tap or an install script that the vendor publishes in its own README or on its own website.
3. If there is no official source: do not install. Report it and skip it.

Also:

- Before you add a cask, confirm that its app bundle ID matches the app on the current Mac. A cask name can belong to a different product (see `orca`).
- Do not use casks marked deprecated or disabled.
- Do not pipe a script to `sh` from any URL other than the vendor URLs listed in "Required software".

## Mental model: where things live today

```
                 repository (git)                     current Mac only ($HOME)
 ┌──────────────────────────────────┐   ┌───────────────────────────────────────────┐
 │ .zshrc .bashrc .ghostty Brewfile │   │ ~/.claude/settings.json, agents/, commands│
 │ .agents/AGENTS.md + 47 skills    │   │   hooks/, plugins, MCP (~/.claude.json)   │
 │ .omp/agent/config.yml (STALE)    │   │ ~/.omp extensions, 2 rules, personal      │
 │ .orca keybindings + 5 settings   │   │   profile config.yml + models.yml         │
 │ .pi permission gate + extensions │   │ Orca: 218 other settings                  │
 │   (STALE)                        │   │ Pi packages, rtk.ts, 9 extra skills       │
 └──────────────────────────────────┘   │ skill symlinks, dcg, rtk                  │
                                        └───────────────────────────────────────────┘
 untracked, not in git:  topics/  docs/  .claude/gotchas.md  research *.md / *.html
```

Bootstrap flow today, and the points where it stops on a fresh Mac:

```
bootstrap.sh
  ├─ install Homebrew ──────────► brew not on PATH (Apple Silicon)        STOP #1
  ├─ brew bundle ───────────────► deprecated taps in Brewfile             RISK #2
  ├─ Oh My Zsh ─────────────────► wrong check, never installs             BUG  #3
  ├─ copy dotfiles ─────────────► copies .git into ~/.git                 BUG  #4
  ├─ source ~/.zshrc (in bash) ─► zsh syntax fails under set -e           STOP #5
  ├─ npm i -g yarn ─────────────► no node (nvm has no version installed)  STOP #6
  ├─ gcloud
  └─ bootstrap_agents.sh
       ├─ droid / omp / pi install
       ├─ rsync agent folders
       ├─ OMP plugins ──────────► pi-provider-factory not cloned           STOP #7
       ├─ Pi permission gate       (not reached)
       ├─ Orca importer ────────► needs Orca launched once                 STOP #8
       └─ AGENTS.md links          (not reached)
```

## Bootstrap blockers

| # | Location | Problem | Effect |
|---|---|---|---|
| 1 | `bootstrap.sh`, Homebrew step | After install, nothing runs `eval "$(/opt/homebrew/bin/brew shellenv)"` | `brew bundle` fails, because `brew` is not on PATH on Apple Silicon |
| 2 | `Brewfile`, first lines | `tap "homebrew/core"`, `"homebrew/cask"`, `"homebrew/bundle"` are deprecated | Current Homebrew probably fails or warns (not tested) |
| 3 | `bootstrap.sh`, Oh My Zsh step | `if [ -d "$HOME/.zshrc" ]` tests for a directory named `.zshrc` | Oh My Zsh never installs. The check must be `[ ! -d "$HOME/.oh-my-zsh" ]`. Without `RUNZSH=no KEEP_ZSHRC=yes`, the installer also replaces `.zshrc` and starts a new shell |
| 4 | `bootstrap.sh`, copy loop | The glob `.[!.]*` matches `.git`, `.gitignore`, `.kube_config_example` | The repository `.git` goes to `~/.git`, so `$HOME` becomes a git work tree |
| 5 | `bootstrap.sh` | `source $HOME/.zshrc` runs in bash | zsh and Oh My Zsh syntax fails, and `set -e` stops the script |
| 6 | `bootstrap.sh` | `nvm` comes from brew, but nothing runs `nvm install` | No `node` or `npm`: yarn, Pi (`npm install -g`) and the Orca importer fail |
| 7 | `bootstrap_agents.sh` | `.omp/_bootstrap/install.sh` needs `~/Documents/www/pi-provider-factory`, and nothing clones it | Exit 1. With `set -e`, the Pi gate, the Orca restore and the AGENTS.md links do not run |
| 8 | `bootstrap_agents.sh` | The Orca importer needs a profile that exists only after Orca runs once | On a fresh Mac it exits 1, with the same effect as #7 |
| 9 | `.zshrc` | Sources `~/.config/fzf-git.sh` and loads the `zsh-autosuggestions` plugin | Bootstrap installs neither, so each new shell shows errors |
| 10 | `bootstrap.sh`, `bootstrap_agents.sh` | The first line is `# /bin/bash`, which is a comment, not a shebang | `shopt` and `${!var}` depend on the shell that runs the script |

Note: `~/.git` does not exist on the current Mac, so the current copy loop has not run here. Nobody has tested the full bootstrap from start to end.

Design note for #7 and #8: one optional step that fails under `set -e` stops all the steps after it, without a clear message. Each per-agent installer must report its own failure and let the other steps continue.

## Smaller defects

- `.ghostty` goes to `~/.ghostty`, but Ghostty reads `~/Library/Application Support/com.mitchellh.ghostty/config`. The live file is also different: `font-size = 8` (repository: 11), and shift+enter sends `\x1b[13;2u` (repository: `\x1b\r`).
- `github_setup.sh`: `$1` and `$2` have no quotes, so a name with a space fails.
- `ssh.sh`:
  - `~/.ssh` may not exist, so `touch` can fail.
  - `tee ~/.ssh/config` overwrites the existing config.
  - `ssh-add -K` is deprecated; use `--apple-use-keychain`.
- `README.md`:
  - The clone URL is the placeholder `yourusername`.
  - An SSH clone cannot work on a new Mac before `ssh.sh` runs, so clone with HTTPS or run `gh auth login` first.
  - The README does not say that Orca must run once before bootstrap.
- `bootstrap_agents.sh` copies all of `.pi/` to `~/.pi/` (tests, `package.json`, the installer), and the gate installer also copies the security files. This is clutter, not a failure.
- Drift between the repository and `$HOME`:
  - `~/.zshrc` adds bun completions and `~/.local/bin` (for the Orca/Parrot dev build), and changes the `/usr/local/bin` PATH line.
  - `~/.bashrc` adds the envman loader and a check that warns when the `dcg` hook is missing.

## Claude Code

The repository has only an untracked `.claude/gotchas.md`. These items exist only on the current Mac:

- Install: the `claude-code` cask is installed, but it is not in the `Brewfile`.
- Links that bootstrap does not create:
  - `~/.claude/CLAUDE.md` → `~/.agents/AGENTS.md`
  - 49 entries `~/.claude/skills/*` → `~/.agents/skills/*`
  - `~/.claude/skills/bulk-refactor-workflow` is a real folder, not a link
- `~/.claude/settings.json`: model, effort, theme, 8 enabled plugins, 2 extra marketplaces, and PreToolUse hooks for `/Users/beeshop/.local/bin/dcg` and `rtk hook claude`.
- The marketplace `claude-code-plugins` (`git@github.com:anthropics/claude-code.git`) is in `~/.claude/plugins/known_marketplaces.json`, but not in `extraKnownMarketplaces`. On a new Mac the 6 plugins from it will not resolve.
- Hook tools: `dcg` (in `~/.local/bin`) and `rtk` (brew) are not installed by anything in the repository.
- Other files: `agents/` (11 files), `commands/` (7 files), `hooks/block-env-read.sh`, `RTK.md`, `SYSTEM_PROMPT_OVERRIDE.md`.
- MCP: `chrome-devtools` (`npx chrome-devtools-mcp@latest`) in `~/.claude.json`. Do not mirror `~/.claude.json`, because it also holds auth and per-project state.

Proposal:

- Add a curated `.claude/` mirror: `settings.json` (with portable hook paths), `agents/`, `commands/`, `hooks/`, `RTK.md`.
- Bootstrap creates the `CLAUDE.md` link and the skill links.
- Add the `claude-code-plugins` marketplace to `extraKnownMarketplaces`.
- Add MCP servers with `claude mcp add`, not by copying `~/.claude.json`.
- Install `claude-code`, `rtk` and `dcg` from bootstrap.

## OMP (Oh My Pi)

- `~/.omp/agent/config.yml` is newer than `.omp/agent/config.yml`. Differences:
  - `modelRoles`: `task`, `smol`, `slow`, `default` and `advisor` changed (Anthropic Haiku and Opus in some roles).
  - New keys: `disabledProviders`, `composer.tokenRate`, `task.enableEffort`, `task.prewalk`, `compaction.methodOrder`, `eval.autoBackground`, `prewalk.enabled: true`, `snapcompact`, `speechgen`, `stt`, `recap`, `bash.gitGuard`.
  - `retry.fallbackChains.default` changed to `anthropic/claude-sonnet-5-5:medium`.
  - `task.agentModelOverrides.scout` changed to `cursor/composer-2.5-fast`.
- `mcp.json`: both `~/.omp/agent/mcp.json` and the personal profile also disable `headroom`. The personal profile also has a `strava` HTTP server.
- Only in `$HOME`:
  - `~/.omp/profiles/personal/agent/config.yml`
  - `~/.omp/profiles/personal/agent/models.yml` (its `apiKey` is a `!command` reference, not a literal key, so the file is probably safe to mirror; verify before commit)
  - extensions in `~/.omp/agent/extensions/`: `orca-agent-status.ts`, `orca-prefill.ts`, `orca-titlebar-spinner.ts`, `rtk.ts`
  - extensions in `~/.omp/profiles/personal/agent/extensions/`: the three `orca-*.ts` files
  - rules: `preserve-progress-on-ambiguous-restore.md`, `verify-cwd-before-relative-edits.md`
  - `~/.omp/gotchas.md`
- Plugin source: `.omp/_bootstrap/plugins.json` needs `~/Documents/www/pi-provider-factory` (clone of `https://github.com/tjboudreaux/pi-provider-factory`). Bootstrap must clone it before `install.sh`.
- Open question: `omp` lives in `~/.bun/bin`. Not verified: does `curl -fsSL https://omp.sh/install | sh` also install bun?

Proposal:

- Sync `$HOME` → repository first.
- Add the missing extensions, rules and profile files.
- Clone the plugin source in bootstrap.
- Make the OMP plugin step non-fatal.

## Orca

- The importer `.orca/_bootstrap/install.js` is well designed: it merges, makes a backup, and refuses to run while Orca runs.
- It restores only the source-control keys (`branchPrefix`, `branchPrefixCustom`, `autoRenameBranchFromWork`, `sourceControlAi`, `commitMessageAi`). The Orca profile has 223 settings keys.
- Not restored: `defaultTuiAgent: omp`, theme, fonts, experimental flags, agent default arguments and environment, and more.
- Orca is not in the `Brewfile`.
- `~/.orca/agent-hooks/` holds hook scripts for each agent. Probably Orca installs them itself (not verified).

Proposal:

- Change `source-control.json` into a general settings allowlist (for example `.orca/settings.json`) that holds all the keys you want on every Mac.
- Add a generic top-level merge to the importer.
- Do not mirror accounts (`claudeManagedAccounts`, `codexManagedAccounts`), repositories, sessions or SSH targets. Sign in again for those.
- Bootstrap prints a clear message if the Orca profile does not exist yet, and does not stop.

## Pi and shared skills

- `.pi/agent/extensions/orca-agent-status.ts`, `orca-prefill.ts` and `orca-titlebar-spinner.ts` are older than the files in `~/.pi/agent/extensions/`. `rtk.ts` exists only in `$HOME`.
- `~/.pi/agent/settings.json` has 4 npm packages (`pi-web-access`, `@ff-labs/pi-fff`, `pi-subagents`, `@juicesharp/rpiv-todo`). The gate installer does not restore them.
- `~/.pi/agent/AGENTS.md` is a separate file (4.3 KB), not a link to the shared `AGENTS.md`. Decide if this is intended.
- `~/.pi/agent/skills/` has links for `agent-browser`, `computer-use`, `orca-cli`, `orchestration`. Bootstrap does not create them.
- Skills in `~/.agents/skills` but not in the repository: `bulk-refactor-workflow`, `cluster-operations`, `code-comments`, `goodkey-pr-review`, `orca-computer-use`, `orca-orchestration`, `prd-implement`, `prd-to-issues`, `write-a-prd`.
- Skills in the repository but not in `~/.agents/skills`: `shell-script-writing`, `small-change`, `system-exploration`.

## Homebrew and apps

- Installed with brew but not in the `Brewfile`: bash, bat-extras, ffmpeg, gnupg, gnupg-pkcs11-scd, hashicorp/tap/terraform, helm, imagemagick, jesseduffield/lazydocker/lazydocker, lazygit, libfido2, pinentry-mac, pipx, postgresql@16, ripgrep, rtk, yt-dlp, yubico-piv-tool.
- Casks not in the `Brewfile`: aws-vault-binary, claude-code, font-hack-nerd-font, font-meslo-lg-nerd-font, iterm2, notion-calendar.
- Taps not in the `Brewfile`: hashicorp/tap, jesseduffield/lazydocker.
- Apps installed outside brew: Orca, Ghostty, Docker, Obsidian, Arc, Google Chrome, Cursor, Slack, Telegram, Tailscale, Cloudflare WARP, Figma, Postman, Notion, Spotify, Yubico Authenticator, Viber, Steam, and more. The section "Required software" gives verified casks for the apps on the required list. The other apps (Viber, Figma, Postman, Tailscale, Cursor, Chrome and more) are not verified and are not required now.
- `mas` (Mac App Store CLI) is not installed. The README TODO lists it.
- Conflict: the `Brewfile` installs `postgresql@15` and `redis` as local services, but the agent rule says "always run services in docker". Docker Desktop is not in the `Brewfile`.
- Go: `.zshrc` adds `/usr/local/go/bin`, but bootstrap does not install Go (README TODO).

## Folder layout

Bootstrap must create these folders (`mkdir -p`, safe to run again):

```
~/Documents/
├── www/
│   └── projects/          ← dotfiles, parrot, other repositories
└── media/
    └── screenshots/       ← macOS screenshot location
```

Facts from the current Mac:

- All four folders exist.
- `defaults read com.apple.screencapture location` returns `~/Documents/media/screenshots`.

Decision (approved 2026-10-22): after the folders exist, bootstrap also sets the screenshot location:

```sh
defaults write com.apple.screencapture location "$HOME/Documents/media/screenshots"
killall SystemUIServer
```

Note: the dotfiles repository itself must be cloned to `~/Documents/www/projects/dotfiles`. The agent instructions and `AGENTS.md` links use this path. So the README must tell you to create `~/Documents/www/projects` before the clone, or the clone command must create it.

## Required software

Verified on 2026-10-22 with `brew info --cask --json=v2` and the vendors' READMEs. "Bundle ID" is the ID of the app on the current Mac. It confirms that the source installs the same product.

Agent CLIs:

| Tool | Source | Download host | Tier | Notes |
|---|---|---|---|---|
| Claude Code | cask `claude-code` | `downloads.claude.ai` | 1 | Installed with this cask on the current Mac |
| Codex | cask `codex` | `github.com/openai/codex` releases | 1 | On the current Mac, `~/.local/bin/codex` is a link to a copy that Orca manages (`~/Library/Application Support/orca/codex-accounts/...`). Decide which copy goes first on PATH |
| Droid (Factory) | cask `droid` | `downloads.factory.ai` | 1 | Replaces `curl https://app.factory.ai/cli \| sh` in `bootstrap_agents.sh` |
| Pi | npm `@earendil-works/pi-coding-agent` | npm registry, repository `github.com/earendil-works/pi` | 2 | pi.dev lists `npm install -g --ignore-scripts @earendil-works/pi-coding-agent` and `curl -fsSL https://pi.dev/install.sh \| sh`. Use the npm command with `--ignore-scripts` (install scripts do not run). Needs node from nvm first |
| OMP | `curl -fsSL https://omp.sh/install \| sh`, or vendor tap `can1357/tap/omp` | `build.stencil.so` (SHA-256 checked by the script), or bun from npm | 2 | Both are in the README of `github.com/can1357/oh-my-pi`. On the current Mac, `omp` is in `~/.bun/bin` (installed with bun) |

Apps:

| App | Cask | Download host | Bundle ID on the current Mac | Tier |
|---|---|---|---|---|
| Orca | `stablyai/orca/orca` (vendor tap `github.com/stablyai/homebrew-orca`) | `github.com/stablyai/orca` releases | `com.stablyai.orca` | 2 |
| Docker Desktop | `docker-desktop` (the old name `docker` resolves to it) | `desktop.docker.com` | `com.docker.docker` | 1 |
| Raycast | `raycast` (already in `Brewfile`) | `releases.raycast.com` | | 1 |
| Ghostty | `ghostty` | `release.files.ghostty.org` | `com.mitchellh.ghostty` | 1 |
| Slack | `slack` | `downloads.slack-edge.com` | | 1 |
| Notion | `notion` | `desktop-release.notion-static.com` | | 1 |
| Obsidian | `obsidian` | `github.com/obsidianmd` releases | | 1 |
| Spotify | `spotify` | `download.scdn.co` (Spotify CDN) | | 1 |
| Steam | `steam` | `cdn.cloudflare.steamstatic.com` (Valve CDN) | `com.valvesoftware.steam` | 1 |
| Visual Studio Code | `visual-studio-code` (already in `Brewfile`) | `update.code.visualstudio.com` | | 1 |
| Telegram | `telegram` | `osx.telegram.org` | `ru.keepcoder.Telegram` | 1 |
| Cloudflare WARP | `cloudflare-warp` | `downloads.cloudflareclient.com` | `com.cloudflare.1dot1dot1dot1.macos` | 1 |
| Yubico Authenticator | `yubico-authenticator` | `developers.yubico.com` | `com.yubico.yubioath` | 1 |
| Arc | `arc` | `releases.arc.net` | `company.thebrowser.Browser` | 1 |

Traps found:

- `orca` in `homebrew/cask` is **plotly/orca** (a chart export tool). It is disabled and has nothing to do with Orca IDE. Use only `stablyai/orca/orca`. The Orca README gives this tap. The tap belongs to the `stablyai` organization, and its cask downloads from `github.com/stablyai/orca` releases. Orca.app on the current Mac is signed with team ID `6CX3WHS9HZ` and updates from `stablyai/orca`.
- Telegram has two casks: `telegram` (native macOS app, `ru.keepcoder.Telegram`) and `telegram-desktop` (the cross-platform app, `desktop.telegram.org`). The current Mac uses the native app, so use `telegram`.
- Docker: the cask token is now `docker-desktop`. Write that name in the `Brewfile`.

Skipped: none. Every item in the list has an official source.

Proposed `Brewfile` lines:

```ruby
tap "stablyai/orca"

cask "claude-code"
cask "codex"
cask "droid"
cask "stablyai/orca/orca"
cask "docker-desktop"
cask "raycast"
cask "ghostty"
cask "slack"
cask "notion"
cask "obsidian"
cask "spotify"
cask "steam"
cask "visual-studio-code"
cask "telegram"
cask "cloudflare-warp"
cask "yubico-authenticator"
cask "arc"
```

## parrot

Repository: `https://github.com/dmytro587/parrot`. It is public and a fork of `humanitas-labs/parrot`: on-device dictation for macOS, written in Swift, default branch `master`.

Target: clone to `~/Documents/www/projects/parrot` and install from source.

Facts from the current Mac:

- No checkout at `~/Documents/www/projects/parrot`.
- `~/.local/bin/parrot` links to `/Applications/Parrot.app/Contents/MacOS/parrot`.
- `/usr/local/bin/parrot` is a separate binary from May (an old CLI install).
- `~/.zshrc` puts `~/.local/bin` before `/usr/local/bin` for this reason.
- Xcode Command Line Tools and Swift 6.1.2 are installed.

Build from source (from the parrot README):

```sh
scripts/fetch-needle.sh            # downloads the Needle engine
swift build -c release && swift test
scripts/dev-install.sh             # build, sign, install Parrot.app, link the CLI
```

Risks and requirements:

- `scripts/fetch-needle.sh` downloads a prebuilt static library, `libneedle.a`, from `huggingface.co/Cactus-Compute/needle3` with no checksum. This is a third-party binary that links into the app. Proposal: pin a SHA-256 in the fork, or download it manually and inspect it. Do not run it unattended in bootstrap until a checksum is pinned.
- Signing: `build-app.sh` signs with the first "Developer ID Application" identity in the keychain. On a new Mac without that certificate, it falls back to ad-hoc signing. The script says that Accessibility and Microphone permissions then do not survive the next build. To keep them, move the Developer ID certificate to the new Mac (Keychain export, `.p12`), or accept that you grant the permissions again after each build.
- `dev-install.sh` can call `sudo` to create the `/usr/local/bin/parrot` link, and asks before it replaces a plain binary there. Run it interactively, not from an unattended bootstrap. Or set `PARROT_LINK_DIR=$HOME/.local/bin`.
- Phonon-2 needs Python 3.10+ (`parrot models install-runtime` does a pip install into `~/.local/bin`). The macOS `/usr/bin/python3` is often 3.9. This is optional, and only if you use Phonon-2.
- SwiftPM fetches dependencies from `Package.resolved`. Versions are pinned there.

Alternative: the upstream signed, notarized `Parrot.dmg` from `github.com/humanitas-labs/parrot` releases. This is safer, but it is not your fork.

Proposal: bootstrap clones the repository only. A separate script, `parrot_setup.sh`, does the build and install, and you run it by hand after the Developer ID certificate is in the keychain.

## Move `topics/` and other untracked files

Facts:

- `topics/` is 2.8 MB, 281 files.
- It has `.obsidian/` (vault settings).
- It has a `.git` with no commits, so git does not protect this data now.
- `.gitignore` already ignores `/topics/`.

Proposal: zip it, then send it with AirDrop. Use `ditto`, so hidden folders and metadata stay with the files:

```sh
ditto -c -k --keepParent topics ~/Desktop/topics.zip
```

On the new Mac, clone the repository first. Then unzip into `~/Documents/www/projects/dotfiles/`.

Long-term option: make `topics/` its own private repository (it is already `git init`ed). The "do not push" rule applies to this dotfiles repository, not to a separate private one. This is your decision, because the content is personal.

Put these untracked items in the same zip:

- `docs/`
- `.claude/gotchas.md`
- `.agents/documentation-continuity.md`
- the research files in the repository root (`ai-money-youtube-research.md`, `codex-cron-vacancy-monitor.md`, `cycling-shorts-*.html`, and the two Ukrainian-named `.md` files)
- optional: `~/.claude/projects/*/memory/`, `~/.omp/agent/memories/`

Do not copy secrets. Sign in again on the new Mac and create new keys there:

- SSH key
- `gh auth login`
- Claude Code
- Orca accounts
- OMP `~/.omp/secrets/`
- Pi `~/.pi/agent/auth.json`
- Factory auth (`~/.factory/auth.*`)
- aws-vault
- GPG and YubiKey

`~/.orca/factory-api-key.enc` probably uses a Keychain key from the current Mac, so it will not decrypt on the new Mac (inference, not verified).

## Plan

Do step 1 first. If you test bootstrap on the current Mac before step 1, it replaces live OMP config with older repository copies.

```
1. Sync drift $HOME → repository
     → verify: diff -q is clean for every mirrored file
2. Fix bootstrap blockers #1 to #10
     → verify: run in a fresh macOS user account or a VM; the run reaches the last line
3. Make agent steps independent (report the failure, continue); clone pi-provider-factory first
     → verify: remove the plugin source temporarily; the other steps still run
4. Claude mirror and links; Orca settings allowlist; Pi packages
     → verify: new user account gets the same settings, plugins, skills and hooks
5. Brewfile update: add the casks from "Required software", the missing tools, remove deprecated taps
     → verify: brew bundle check --file=./Brewfile; each cask resolves to tap homebrew/cask or stablyai/orca
6. Folder layout and screenshot location in bootstrap
     → verify: the four folders exist; defaults read com.apple.screencapture location
7. Agent CLIs from official sources (Pi with --ignore-scripts, OMP, droid cask)
     → verify: claude, codex, droid, pi, omp all run --version
8. parrot: clone in bootstrap; separate parrot_setup.sh for the build
     → verify: Parrot.app opens; parrot doctor passes
9. README: real clone URL and order "create ~/Documents/www/projects → HTTPS clone → bootstrap
   → launch Orca once → ssh.sh → parrot_setup.sh"
10. Move topics/ and untracked files with AirDrop
     → verify: Obsidian opens the vault on the new Mac
```

## Progress

- [x] 1. Sync drift from `$HOME` to the repository
- [ ] 2. Fix bootstrap blockers
- [x] 3. Make agent steps independent
- [ ] 4. Claude, Orca, Pi configuration in the repository
- [ ] 5. Update the Brewfile
- [ ] 6. Folder layout and screenshot location
- [ ] 7. Agent CLIs from official sources
- [ ] 8. parrot clone and setup script
- [x] 9. Update the README
- [ ] 10. Move `topics/` and untracked files

## Decisions

Approved on 2026-10-22:

- Claude `settings.json`: a curated subset. Mirror model, effort, theme, enabled plugins, marketplaces (add `claude-code-plugins`), and hooks with paths that do not depend on the user name (`$HOME`). Do not mirror the permissions allowlist or machine state.
- Testing: Docker only. Tests run the script logic in a Linux container with stubbed macOS commands and a fake `$HOME`. They do not install real software. Docker cannot test casks, `defaults`, `codesign` or the macOS apps; test those by hand on the new Mac.
- OMP install: the `omp.sh` script (`curl -fsSL https://omp.sh/install | sh`).
- parrot: bootstrap clones the fork only. A separate `parrot_setup.sh` builds and installs it, and you run it by hand.
- Screenshot location: bootstrap sets it to `~/Documents/media/screenshots`.

Defaults until you decide (no behavior change):

- Codex: add the `codex` cask. Do not change PATH order, so the copy that Orca manages in `~/.local/bin` stays first.
- `~/.pi/agent/AGENTS.md`, the skills that exist in only one place, `postgresql@15` and `redis`, and the Developer ID certificate: no change.

## Open decisions

- `~/.pi/agent/AGENTS.md`: keep it separate, or link it to the shared `AGENTS.md`?
- Skills that exist in only one place: which ones go into the repository, and which ones you remove?
- `postgresql@15` and `redis` in the `Brewfile`: keep them (client tools), or remove them and use Docker only?
- `topics/`: AirDrop only, or also a separate private repository?
- Codex: keep both copies? Which one goes first on PATH?
- Move the Developer ID certificate to the new Mac, yes or no?

## Log

- 2026-10-22: Read-only review done. Findings and plan written in this file.
- 2026-10-22: Added the safety rule, folder layout, required software with verified sources, and parrot. Found that the `orca` cask is plotly/orca, not Orca IDE. No software skipped.
- 2026-10-22: Approved: bootstrap sets the macOS screenshot location to `~/Documents/media/screenshots` (plan step 6). Not implemented yet.
- 2026-10-22: Implemented plan steps 1 to 9. Step 10 (move `topics/`) is manual and not done.
  - Step 1: copied newer OMP, Pi, shell, Ghostty and Claude files from `$HOME`, checked with `cmp`. The only `apiKey` found is a `!cat` command reference. Wrote a curated `.claude/settings.json`.
  - Step 2 (not ticked): `bootstrap.sh` fixes for blockers 1, 3, 4, 5, 6, 9 and 10. `.zshrc` loads nvm from the Homebrew path when `$NVM_DIR` has no `nvm.sh`. Still needs a macOS VM run.
  - Step 3: `bootstrap_agents.sh` runs each step with `run_step`, lists failed steps, and exits 1 when any step failed. The Droid curl installer is removed. Pi installs with `--ignore-scripts`. Ticked: the Docker test injects an OMP plugin failure instead of removing the plugin source.
  - Step 4: the Pi permission gate installer adds the four Pi packages. `permission-installer.test.ts` now expects them.
  - Step 5: Brewfile updated. The old `aws-vault` cask token now points to `aws-vault-binary`, so the old line is replaced. `rtk` is added (tap `homebrew/core`). The Orca cask was read from `stablyai/homebrew-orca` on GitHub, because `brew info` needs the tap installed, and installing it would change this Mac.
  - Step 6: folders and screenshot location in `bootstrap.sh`. `ssh.sh` and `github_setup.sh` fixed. `bootstrap.sh`, `ssh.sh` and `github_setup.sh` made executable.
  - Step 7: agent sources as in step 3. Droid comes from its cask.
  - Step 8: `parrot_setup.sh` added. Not run.
  - Step 9: README order and clone URL updated.
  - Tests: `bash tests/bootstrap/run.sh` (Docker). Lint: PASS. First run, second run, and failing OMP step: 20 checks PASS, 0 FAIL. Pi gate tests: one test is excluded by name, because it starts the `pi` CLI, which the image does not install. Node reports 47 passed, but that count includes the excluded test, so it is not proof for that test.
  - Not run: `brew bundle check`, a macOS VM run, cask installs, `codesign`, the parrot build, and the `pi`, `omp`, `claude`, `codex` and `droid` version checks. `dcg` is not installed, because no official source is verified. Codex cask added, PATH order unchanged (see Defaults).
- 2026-10-22: Independent review of the step 1 to 9 changes.
  - Re-ran `bash tests/bootstrap/run.sh`: 20 PASS, 0 FAIL, 1 SKIP (the Pi runtime test). Same result as the implementation run.
  - New finding: `omp.sh/install` puts `omp` in `~/.local/bin`, which is not on PATH in the bootstrap shell on a new Mac. The "Install local OMP plugins" step then fails with "omp is required". The Docker stubs hide this, because they put a fake `omp` on PATH. Fix: add `export PATH="$HOME/.local/bin:$PATH"` near the top of `bootstrap_agents.sh`. Not fixed yet.
  - Risk (inference, not verified): `bootstrap.sh` sources `nvm.sh` under `set -e`. Some nvm versions return non-zero when no default alias exists, which stops the script. Fix: wrap the source and `nvm install` in `set +e` / `set -e`. Not fixed yet.
  - Risk: the curated `.claude/settings.json` keeps the PreToolUse hook `$HOME/.local/bin/dcg`. Until `dcg` is installed, each Bash call in Claude Code shows a hook error. Decide: find the official `dcg` source, or remove the hook from the repository copy.
  - Note: `bootstrap.sh` overwrites `~/.zshrc` and `~/.bashrc` with no backup. On a new Mac this is correct. Do not run it on the current Mac.
  - Note: `POLISHING.md` was found staged in git (`A`). Neither the implementation agent nor the reviewer ran `git add`. It is left as is for the user to decide.
  - Open: apply the `.zshrc` nvm fallback to the real `~/.zshrc` (repository and `$HOME` must stay in sync). Needs user approval.
