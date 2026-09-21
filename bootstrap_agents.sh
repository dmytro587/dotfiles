# /bin/bash

# Install coding agents and configure their skills, instructions, MCP, and permission gate.
#
# Usage: ./bootstrap_agents.sh

set -e

# Run from the repository root regardless of the caller's working directory
cd "$(dirname "$0")"

# Install agents
echo "Installing coding agents"
if ! command -v droid &> /dev/null; then
  echo "Installing Droid CLI"
  curl -fsSL https://app.factory.ai/cli | sh
fi

if ! command -v omp &> /dev/null; then
  echo "Installing OMP (Oh My Pi)"
  curl -fsSL https://omp.sh/install | sh
fi

if ! command -v pi &> /dev/null; then
  echo "Installing Pi coding agent"
  npm install -g @earendil-works/pi-coding-agent
fi

# Configure agents
# Copy repository files without deleting files that exist only in HOME.
# AGENTS.md is linked separately so the repository file remains the source of truth.
# A skill whose repo directory has no SKILL.md but has DISABLED_SKILL.md is
# disabled: the home copy must not gain a SKILL.md, and an existing home
# SKILL.md is removed so a locally disabled skill stays disabled after sync.
for agent_dir in .agents .claude .omp .pi .factory; do
  if [ ! -d "./$agent_dir" ]; then
    continue
  fi
  mkdir -p "$HOME/$agent_dir"
  if [ "$agent_dir" = .omp ]; then
    rsync -a --exclude=_bootstrap "./$agent_dir/" "$HOME/$agent_dir/"
  elif [ "$agent_dir" = .agents ]; then
    rsync -a --exclude=AGENTS.md "./$agent_dir/" "$HOME/$agent_dir/"
  else
    rsync -a "./$agent_dir/" "$HOME/$agent_dir/"
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

echo "Installing local OMP plugins"
bash ./.omp/_bootstrap/install.sh

bash ./.pi/install_pi_permission_gate.sh

# Link shared instructions to the repository source of truth.
ln -sfn "$(pwd)/.agents/AGENTS.md" "$HOME/.agents/AGENTS.md"

# Link instructions into existing agent folders.
for agent_dir in "$HOME/.omp" "$HOME/.factory"; do
  if [ -d "$agent_dir" ]; then
    ln -sfn "$HOME/.agents/AGENTS.md" "$agent_dir/AGENTS.md"
  fi
done
