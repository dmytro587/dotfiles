# Each tap belongs to the project's own owner, and the project docs name it.
# Homebrew 7 loads nothing from a non-official tap unless it is trusted, so
# trust only the one formula or cask that this file installs from each tap.
tap "derailed/k9s", trusted: { formulae: ["k9s"] }
tap "ngrok/ngrok", trusted: { casks: ["ngrok"] }
tap "smudge/smudge", trusted: { formulae: ["nightlight"] }
tap "stablyai/orca", trusted: { casks: ["orca"] }
tap "hashicorp/tap", trusted: { formulae: ["terraform"] }
tap "jesseduffield/lazydocker", trusted: { formulae: ["lazydocker"] }

brew "awscli"
# 99designs/aws-vault README names this formula. It builds the maintained ByteNess fork.
brew "aws-vault"
brew "openssl@3"
brew "gh"
brew "nvm"
brew "jq"

brew "tree"
brew "yq"
brew "bat"
brew "bat-extras"
brew "fd"
brew "fzf"
brew "ripgrep"
brew "smudge/smudge/nightlight"

brew "bash"
brew "ffmpeg"
brew "gnupg"
brew "gnupg-pkcs11-scd"
brew "imagemagick"
brew "lazygit"
brew "libfido2"
brew "pinentry-mac"
brew "pipx"
brew "rtk"
brew "yt-dlp"
brew "yubico-piv-tool"

brew "kubernetes-cli"
brew "kops"
brew "derailed/k9s/k9s"
brew "helm"
brew "neovim"
brew "hashicorp/tap/terraform"
brew "jesseduffield/lazydocker/lazydocker"

brew "act"
brew "sqlite"
brew "postgresql@16"
brew "redis"
brew "softhsm"

# Only casks that the vendor's own docs tell you to install with Homebrew.
# bootstrap.sh installs the other apps from the vendor download URLs.
cask "font-hack-nerd-font"
cask "font-meslo-lg-nerd-font"
# ngrok's own tap. Keep the full name: plain "ngrok" installs the homebrew/cask copy.
cask "ngrok/ngrok/ngrok"
# CLI tools, not desktop applications.
cask "claude-code"
cask "codex"
cask "droid"

# Skip an app that is already on the machine, however it was installed.
# Without this, Homebrew stops with "already an App at" for apps it did not install.
app_installed = ->(app) { ["/Applications", File.expand_path("~/Applications")].any? { |dir| File.directory?("#{dir}/#{app}") } }
cask "stablyai/orca/orca" unless app_installed.("Orca.app")
cask "raycast" unless app_installed.("Raycast.app")
cask "notion-calendar" unless app_installed.("Notion Calendar.app")
