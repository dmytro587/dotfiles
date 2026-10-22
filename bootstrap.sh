#!/bin/bash

# This script bootstraps a new macOS development environment
# It will:
# 1. Install Homebrew package manager if not present
# 2. Install packages from Brewfile and apps from vendor download URLs
# 3. Install Oh My Zsh and the zsh-autosuggestions plugin
# 4. Copy dotfiles to home directory
# 5. Create project and screenshot folders
# 6. Install the latest Node.js with nvm, Yarn, and the latest Go
# 7. Install Google Cloud CLI if not already installed
# 8. Set up coding agents (see bootstrap_agents.sh)
#
# Usage: ./bootstrap.sh

set -e

# Run from the repository root regardless of the caller's working directory
cd "$(dirname "$0")" || exit 1

# Check if Homebrew is installed
if ! command -v brew &> /dev/null; then
  echo "Installing Homebrew"

  # Homebrew's documented command. Under sh (bash in POSIX mode) it aborts.
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

# On Apple Silicon, a new Homebrew install is not on PATH until shellenv runs
if [ -f /opt/homebrew/bin/brew ]; then
  eval "$(/opt/homebrew/bin/brew shellenv)"
fi

# Install packages from Brewfile
echo "Installing packages from Brewfile"
brew bundle --file=./Brewfile

# Install apps that the vendor does not tell you to install with Homebrew.
# Each URL is the version-free link from the vendor's own download page.
apps_dir=/Applications

# True when the app is in /Applications or ~/Applications, however it was installed.
app_installed() {
  [ -d "$apps_dir/$1" ] || [ -d "$HOME/Applications/$1" ]
}

# Download a .dmg and copy the app out of it. This is the vendor's
# "drag to Applications" step. An installed app is not touched.
install_dmg_app() {
  local app="$1" url="$2" tmp
  if app_installed "$app"; then
    return 0
  fi
  echo "Installing $app"
  tmp="$(mktemp -d)"
  curl -fsSL -o "$tmp/app.dmg" "$url"
  # yes accepts the license prompt that some images show on attach
  yes | hdiutil attach -nobrowse -readonly -mountpoint "$tmp/mnt" "$tmp/app.dmg" > /dev/null
  cp -R "$tmp/mnt/$app" "$apps_dir/"
  hdiutil detach "$tmp/mnt" > /dev/null
  rm -rf "$tmp"
}

# Docker and Go use the same names for the two Mac CPU types
mac_arch=arm64
if [ "$(uname -m)" = "x86_64" ]; then
  mac_arch=amd64
fi
install_dmg_app Docker.app "https://desktop.docker.com/mac/main/$mac_arch/Docker.dmg"
install_dmg_app Telegram.app https://telegram.org/dl/macos
install_dmg_app Steam.app https://cdn.fastly.steamstatic.com/client/installer/steam.dmg
install_dmg_app Arc.app https://releases.arc.net/release/Arc-latest.dmg
install_dmg_app "Visual Studio Code.app" https://update.code.visualstudio.com/latest/darwin-arm64-dmg/stable
install_dmg_app "Yubico Authenticator.app" https://developers.yubico.com/yubioath-flutter/Releases/yubico-authenticator-latest-mac.dmg
install_dmg_app Notion.app https://www.notion.com/desktop/mac-apple-silicon/download
install_dmg_app Slack.app https://slack.com/ssb/download-osx-universal

# Obsidian has no version-free link. The latest release page redirects to the
# newest tag, and the file name is built from that version.
if ! app_installed Obsidian.app; then
  obsidian_tag_url="$(curl -fsSLI -o /dev/null -w '%{url_effective}' https://github.com/obsidianmd/obsidian-releases/releases/latest)"
  obsidian_version="${obsidian_tag_url##*/v}"
  install_dmg_app Obsidian.app "https://github.com/obsidianmd/obsidian-releases/releases/download/v$obsidian_version/Obsidian-$obsidian_version.dmg"
fi

# Ghostty publishes only versioned files. The app updates itself after install.
ghostty_version=1.3.1
install_dmg_app Ghostty.app "https://release.files.ghostty.org/$ghostty_version/Ghostty.dmg"

if ! app_installed "Cloudflare WARP.app"; then
  echo "Installing Cloudflare WARP.app"
  warp_tmp="$(mktemp -d)"
  curl -fsSL -o "$warp_tmp/warp.pkg" https://downloads.cloudflareclient.com/v1/download/macos/ga
  sudo installer -pkg "$warp_tmp/warp.pkg" -target /
  rm -rf "$warp_tmp"
fi

# Spotify ships an installer app that downloads Spotify itself.
# open -W waits until the installer quits. It can need a click.
if ! app_installed Spotify.app; then
  echo "Installing Spotify.app"
  spotify_tmp="$(mktemp -d)"
  curl -fsSL -o "$spotify_tmp/spotify.zip" https://download.scdn.co/SpotifyInstaller.zip
  unzip -q "$spotify_tmp/spotify.zip" -d "$spotify_tmp"
  open -W "$spotify_tmp/Install Spotify.app"
  rm -rf "$spotify_tmp"
fi

# Fira Code publishes only versioned files and no Homebrew instructions.
# Print it at exit, so it is the last output even if a later step fails.
print_manual_apps() {
  echo ""
  echo "Install this by hand from the vendor download page:"
  echo "  Fira Code font  https://github.com/tonsky/FiraCode/wiki/Installing"
}
trap print_manual_apps EXIT

# Install Oh My Zsh. RUNZSH, CHSH and KEEP_ZSHRC stop the installer from
# starting a new shell, changing the login shell, or replacing .zshrc.
if [ ! -d "$HOME/.oh-my-zsh" ]; then
  RUNZSH=no CHSH=no KEEP_ZSHRC=yes sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"
fi

# .zshrc loads this plugin, so install it before the first new shell starts
ZSH_CUSTOM_DIR="${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}"
if [ ! -d "$ZSH_CUSTOM_DIR/plugins/zsh-autosuggestions" ]; then
  git clone https://github.com/zsh-users/zsh-autosuggestions "$ZSH_CUSTOM_DIR/plugins/zsh-autosuggestions"
fi

# .zshrc sources this file for fzf key bindings
if [ ! -f "$HOME/.config/fzf-git.sh" ]; then
  mkdir -p "$HOME/.config"
  curl -fsSL -o "$HOME/.config/fzf-git.sh" https://raw.githubusercontent.com/junegunn/fzf-git.sh/refs/heads/main/fzf-git.sh
fi

# Copy dotfiles to the home directory. List each file here, so .git and
# .gitignore are never copied. Agent setup owns the agent folders.
echo "Copying dotfiles to home directory"
cp .zshrc "$HOME/.zshrc"
cp .bashrc "$HOME/.bashrc"
mkdir -p "$HOME/Library/Application Support/com.mitchellh.ghostty"
cp .ghostty "$HOME/Library/Application Support/com.mitchellh.ghostty/config"

# Create project and screenshot folders
mkdir -p "$HOME/Documents/www/projects" "$HOME/Documents/media/screenshots"
defaults write com.apple.screencapture location "$HOME/Documents/media/screenshots"
killall SystemUIServer || true

# Install the latest Node.js through nvm. Yarn and the agent steps need node.
# "node" is the nvm name for the newest release, not the LTS line.
export NVM_DIR="$HOME/.nvm"
mkdir -p "$NVM_DIR"
. "$(brew --prefix nvm)/nvm.sh"
if ! command -v node &> /dev/null; then
  echo "Installing the latest Node.js"
  nvm install node
fi

# Install yarn if not installed
if ! command -v yarn &> /dev/null; then
  echo "Installing Yarn"
  npm install --global yarn
fi

# Install the latest Go with the official installer from go.dev. It installs
# to /usr/local/go, and .zshrc adds /usr/local/go/bin to PATH. The go.dev
# release list puts the newest stable release first.
if ! command -v go &> /dev/null && [ ! -x /usr/local/go/bin/go ]; then
  go_pkg="$(curl -fsSL 'https://go.dev/dl/?mode=json' | jq -r --arg arch "$mac_arch" '.[0].files[] | select(.os == "darwin" and .arch == $arch and .kind == "installer") | .filename')"
  echo "Installing $go_pkg"
  go_tmp="$(mktemp -d)"
  curl -fsSL -o "$go_tmp/go.pkg" "https://go.dev/dl/$go_pkg"
  sudo installer -pkg "$go_tmp/go.pkg" -target /
  rm -rf "$go_tmp"
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

# Clone repositories needed by the agent setup. Only clone, do not build.
# parrot is built later by parrot_setup.sh.
if [ ! -d "$HOME/Documents/www/projects/parrot" ]; then
  git clone https://github.com/dmytro587/parrot "$HOME/Documents/www/projects/parrot"
fi
if [ ! -d "$HOME/Documents/www/pi-provider-factory" ]; then
  git clone https://github.com/tjboudreaux/pi-provider-factory "$HOME/Documents/www/pi-provider-factory"
fi

# Delegate all agent setup, including skills and configuration.
bash ./bootstrap_agents.sh
