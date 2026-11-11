#!/bin/bash

# Install coding agents and configure their skills, instructions, MCP, and permission gate.
#
# Each step runs even when an earlier step fails. A failed step is listed in the
# summary at the end, and the script then exits 1.
#
# Usage: ./bootstrap_agents.sh

# Run from the repository root regardless of the caller's working directory
cd "$(dirname "$0")" || exit 1

export PATH="$HOME/.local/bin:$PATH"

failed_steps=()

# Run one step. Record a failure and continue with the next step.
run_step() {
  local name="$1"
  shift
  echo "==> $name"
  if ! "$@"; then
    echo "FAILED: $name"
    failed_steps+=("$name")
  fi
}

install_omp() {
  if ! command -v omp &> /dev/null; then
    echo "Installing OMP (Oh My Pi)"
    curl -fsSL https://omp.sh/install | sh
  fi
}

install_pi() {
  if ! command -v pi &> /dev/null; then
    echo "Installing Pi coding agent"
    npm install -g --ignore-scripts @earendil-works/pi-coding-agent
  fi
}

sync_dcg_config() {
  install -d -m 700 "$HOME/.config/dcg" || return 1
  install -m 600 ./.config/dcg/config.toml "$HOME/.config/dcg/config.toml"
}

install_dcg() {
  (
    set -o pipefail
    curl -fsSL "https://raw.githubusercontent.com/Dicklesworthstone/destructive_command_guard/main/install.sh?$(date +%s)" | bash -s -- --easy-mode
  ) || return 1
  dcg --version
}

# Copy agent configuration, but link shared skills and instructions separately.
sync_agent_folders() {
  for agent_dir in .agents .claude .omp .pi .factory .orca; do
    if [ ! -d "./$agent_dir" ]; then
      continue
    fi
    mkdir -p "$HOME/$agent_dir"
    if [ "$agent_dir" = .omp ] || [ "$agent_dir" = .orca ]; then
      rsync -a --exclude=_bootstrap "./$agent_dir/" "$HOME/$agent_dir/" || return 1
    elif [ "$agent_dir" = .agents ]; then
      rsync -a --exclude=AGENTS.md --exclude=skills "./$agent_dir/" "$HOME/$agent_dir/" || return 1
    elif [ "$agent_dir" = .claude ]; then
      # settings.json holds machine state after first use, so it is never overwritten
      rsync -a --exclude=settings.json "./$agent_dir/" "$HOME/$agent_dir/" || return 1
      if [ ! -f "$HOME/.claude/settings.json" ]; then
        cp "./.claude/settings.json" "$HOME/.claude/settings.json"
      else
        echo "Skipped $HOME/.claude/settings.json: it already exists"
      fi
    elif [ "$agent_dir" = .pi ]; then
      # Tests and the installer stay in the repository. Only Pi runtime files go to HOME.
      rsync -a --exclude='*.test.ts' --exclude=package.json --exclude=install_pi_permission_gate.sh "./$agent_dir/" "$HOME/$agent_dir/" || return 1
    else
      rsync -a "./$agent_dir/" "$HOME/$agent_dir/" || return 1
    fi
  done
}

# Keep old copies outside the skills directory so local changes remain recoverable.
function link_shared_skills() {
  local skill_dir skill link_path backup_dir=""
  mkdir -p "$HOME/.agents/skills" || return 1
  for skill_dir in "$(pwd)/.agents/skills"/*; do
    [ -d "$skill_dir" ] || continue
    skill=$(basename "$skill_dir")
    link_path="$HOME/.agents/skills/$skill"
    if [ -L "$link_path" ] && [ "$link_path" -ef "$skill_dir" ]; then
      continue
    fi
    if [ -e "$link_path" ] || [ -L "$link_path" ]; then
      if [ -z "$backup_dir" ]; then
        backup_dir=$(mktemp -d "$HOME/.agents/skills-backup.XXXXXX") || return 1
      fi
      mv "$link_path" "$backup_dir/$skill" || return 1
      echo "Saved existing skill: $backup_dir/$skill"
    fi
    ln -s "$skill_dir" "$link_path" || return 1
  done
}

# Link shared instructions to the repository source of truth, then into
# agent folders that already exist.
link_agents_instructions() {
  ln -sfn "$(pwd)/.agents/AGENTS.md" "$HOME/.agents/AGENTS.md"
  for agent_dir in "$HOME/.omp" "$HOME/.factory"; do
    if [ -d "$agent_dir" ]; then
      ln -sfn "$HOME/.agents/AGENTS.md" "$agent_dir/AGENTS.md"
    fi
  done
}

# Claude Code reads ~/.claude/CLAUDE.md and ~/.claude/skills/<name>.
# Each skill link is created only when nothing exists at that path.
link_claude_files() {
  mkdir -p "$HOME/.claude/skills"
  ln -sfn "$HOME/.agents/AGENTS.md" "$HOME/.claude/CLAUDE.md"
  for skill_dir in "$HOME/.agents/skills"/*/; do
    if [ ! -f "$skill_dir/SKILL.md" ]; then
      continue
    fi
    skill=$(basename "$skill_dir")
    link_path="$HOME/.claude/skills/$skill"
    if [ ! -e "$link_path" ] && [ ! -L "$link_path" ]; then
      ln -s "../../.agents/skills/$skill" "$link_path"
    fi
  done
}

# Pi skills that are shared with ~/.agents. A link is created only when the path is empty.
link_pi_skills() {
  mkdir -p "$HOME/.pi/agent/skills"
  for skill in agent-browser computer-use orca-cli orchestration; do
    link_path="$HOME/.pi/agent/skills/$skill"
    if [ ! -e "$link_path" ] && [ ! -L "$link_path" ]; then
      ln -s "../../../.agents/skills/$skill" "$link_path"
    fi
  done
}

# Orca writes its profile only after its first launch. Until then, the importer cannot run.
restore_orca() {
  if [ ! -f "$HOME/Library/Application Support/orca/profiles/local-default/orca-data.json" ]; then
    echo "Launch Orca once, quit it, then run: node .orca/_bootstrap/install.js"
    return 0
  fi
  node ./.orca/_bootstrap/install.js
}

# Add the browser MCP server only when Claude Code does not have it yet.
add_claude_mcp() {
  if ! command -v claude &> /dev/null; then
    return 0
  fi
  if claude mcp get chrome-devtools &> /dev/null; then
    return 0
  fi
  claude mcp add --scope user chrome-devtools npx chrome-devtools-mcp@latest
}

run_step "Install OMP" install_omp
run_step "Install Pi" install_pi
run_step "Sync agent folders" sync_agent_folders
run_step "Link shared skills" link_shared_skills
run_step "Sync DCG config" sync_dcg_config
run_step "Install DCG" install_dcg
run_step "Link shared AGENTS.md" link_agents_instructions
run_step "Link Claude files" link_claude_files
run_step "Link Pi skills" link_pi_skills
run_step "Install local OMP plugins" bash ./.omp/_bootstrap/install.sh
run_step "Install Pi permission gate" bash ./.pi/install_pi_permission_gate.sh
run_step "Restore Orca source-control settings" restore_orca
run_step "Add Claude chrome-devtools MCP" add_claude_mcp

if [ ${#failed_steps[@]} -gt 0 ]; then
  echo ""
  echo "Agent setup finished with failed steps:"
  printf '  - %s\n' "${failed_steps[@]}"
  exit 1
fi
echo "Agent setup finished"
