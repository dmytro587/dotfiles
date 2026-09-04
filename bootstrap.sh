# /bin/bash

# This script bootstraps a new macOS development environment
# It will:
# 1. Install Homebrew package manager if not present
# 2. Install packages and applications from Brewfile
# 3. Install Oh My Zsh for shell customization
# 4. Copy dotfiles to home directory
# 5. Apply new shell configuration
# 6. Install Yarn if not already installed
# 7. Install Google Cloud CLI if not already installed
#
# Usage: ./bootstrap.sh

set -e

# Check if Homebrew is installed
if test ! $(which brew)
then
  echo "Installing Homebrew"

  sh -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

# Install packages from Brewfile
echo "Installing packages from Brewfile"
brew bundle --file=./Brewfile

# Install Oh My Zsh
if [ -d "$HOME/.zshrc" ]; then
  sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"
fi

# Copy all dotfiles to the home directory
echo "Copying dotfiles to home directory"
shopt -s nullglob
for dotfile in .[!.]*; do
  cp -R "$dotfile" "$HOME/"
done
shopt -u nullglob

# Seed shared agent instructions from the repository; the link step below depends on this file.
mkdir -p "$HOME/.agents"
install -m 0644 ./.agents/AGENTS.md "$HOME/.agents/AGENTS.md"

# Install the explicitly ordered Pi permission gate without replacing other Pi settings.
bash ./.pi/install_pi_permission_gate.sh

echo "Installing coding agents"
if ! command -v droid &> /dev/null; then
  echo "Installing Droid CLI"
  curl -fsSL https://app.factory.ai/cli | sh
fi

if ! command -v omp &> /dev/null; then
  echo "Installing OMP (Oh My Pi)"
  curl -fsSL https://omp.sh/install | sh
fi

# Link shared agent instructions into agent folders that already exist, so no folder is created and no dangling link is left.
for agent_dir in "$HOME/.omp" "$HOME/.factory"; do
  if [ -d "$agent_dir" ]; then
    ln -sfn "$HOME/.agents/AGENTS.md" "$agent_dir/AGENTS.md"
  fi
done

if ! command -v pi &> /dev/null; then
  echo "Installing Pi coding agent"
  npm install -g @earendil-works/pi-coding-agent
fi

# Apply new shell configuration
source $HOME/.zshrc

# Install yarn if not installed
if ! command -v yarn &> /dev/null; then
  echo "Installing Yarn"
  npm install --global yarn
fi

# Install Google Cloud CLI
if ! command -v gcloud &> /dev/null; then
 echo "Downloading Google Cloud CLI..."
  curl -fsSL https://dl.google.com/dl/cloudsdk/channels/rapid/downloads/google-cloud-cli-darwin-arm.tar.gz -o /tmp/google-cloud-cli.tar.gz

  echo "Extracting Google Cloud CLI..."
  tar -xzf /tmp/google-cloud-cli.tar.gz -C $HOME

  echo "Installing Google Cloud CLI..."
  $HOME/google-cloud-sdk/install.sh --quiet

  # Clean up
  rm /tmp/google-cloud-cli.tar.gz
fi
