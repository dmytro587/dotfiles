#!/bin/bash

# Install coding agents and configure their skills, instructions, MCP, and permission gate.
#
# Each step runs even when an earlier step fails. A failed step is listed in the
# summary at the end, and the script then exits 1.
#
# Usage: ./bootstrap_agents.sh

# Run from the repository root regardless of the caller's working directory
cd "$(dirname "$0")" || exit 1

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

# Copy repository files without deleting files that exist only in HOME.
# AGENTS.md is linked separately so the repository file remains the source of truth.
# A skill whose repo directory has no SKILL.md but has DISABLED_SKILL.md is
# disabled: the home copy must not gain a SKILL.md, and an existing home
# SKILL.md is removed so a locally disabled skill stays disabled after sync.
sync_agent_folders() {
  for agent_dir in .agents .claude .omp .pi .factory .orca; do
    if [ ! -d "./$agent_dir" ]; then
      continue
    fi
    mkdir -p "$HOME/$agent_dir"
    if [ "$agent_dir" = .omp ] || [ "$agent_dir" = .orca ]; then
      rsync -a --exclude=_bootstrap "./$agent_dir/" "$HOME/$agent_dir/" || return 1
    elif [ "$agent_dir" = .agents ]; then
      rsync -a --exclude=AGENTS.md "./$agent_dir/" "$HOME/$agent_dir/" || return 1
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
    if [ "$agent_dir" = .agents ]; then
      for skill_dir in .agents/skills/*/; do
        skill=$(basename "$skill_dir")
        if [ ! -f ".agents/skills/$skill/SKILL.md" ] && [ -f ".agents/skills/$skill/DISABLED_SKILL.md" ]; then
          if [ -e "$HOME/.agents/skills/$skill" ] && [ ! -L "$HOME/.agents/skills/$skill" ]; then
            rm -f "$HOME/.agents/skills/$skill/SKILL.md"
          fi
        fi
      done
    fi
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
