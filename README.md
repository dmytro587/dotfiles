# Dotfiles

Personal dotfiles and synchronization guides for macOS environment setup

## TODO
- [ ] Implement custom apps downloading instead of using Homebrew Cask
- [ ] Integrate Mac App Store applications into Brewfile using `mas` CLI
- [ ] Install `go`

## Features

- Shell configuration (zsh with Oh My Zsh)
- Git SSH key setup
- Homebrew packages and apps
- Node.js environment (via nvm)
- Development tools configuration

## Installation

Follow these steps in order on a new Mac.

1. Install the Xcode Command Line Tools. Git needs them:
```sh
xcode-select --install
```

2. Create the project folder and clone this repository. Use HTTPS, because SSH keys do not exist yet:
```sh
mkdir -p ~/Documents/www/projects
git clone https://github.com/dmytro587/dotfiles.git ~/Documents/www/projects/dotfiles
cd ~/Documents/www/projects/dotfiles
```

3. Run the bootstrap script:
```sh
./bootstrap.sh
```

This will:
- Install Homebrew if not present
- Install packages and apps from Brewfile (only casks that the vendor tells you to install with Homebrew)
- Install Docker, Telegram, Steam, Arc, VS Code, Yubico Authenticator, Notion, Slack, Obsidian, Ghostty, Spotify, and Cloudflare WARP from the vendor download URLs. An app that is already in `/Applications` or `~/Applications` is skipped, also for the Brewfile apps
- At the end, print the vendor download page for Fira Code, which you install by hand
- Install Oh My Zsh and the zsh-autosuggestions plugin
- Copy dotfiles to your home directory
- Create the project and screenshot folders
- Install Node.js LTS with nvm and Yarn
- Set up coding agents (see `bootstrap_agents.sh`)

If an agent step fails, the bootstrap prints a summary at the end. Fix that step, then run `./bootstrap_agents.sh` again.

4. Launch Orca once, then quit it. Then restore the Orca settings:
```sh
node .orca/_bootstrap/install.js
```

5. Set up SSH keys and your Git identity. Add the public key to your GitHub account when the script asks:
```sh
./ssh.sh "your.email@example.com"
./github_setup.sh "Your Name" "your.email@example.com"
```

6. Sign in to the agents and apps. Include Claude Code, Codex, OMP, Pi, Droid, Orca, Docker Desktop, and the GitHub CLI (`gh auth login`).

7. Build and install parrot. Run this by hand. The script asks before each step that has a risk:
```sh
./parrot_setup.sh
```

8. Move `topics/` from the old Mac. It is not in git. On the old Mac, zip it with `ditto`, which keeps hidden files and Obsidian settings:
```sh
ditto -c -k --keepParent topics ~/Desktop/topics.zip
```
Send `topics.zip` to the new Mac with AirDrop. Then unzip it into `~/Documents/www/projects/dotfiles/`.

## Orca Configuration

`.orca/` keeps Orca keybindings and global source-control instructions for branch names, pull requests, and commit messages. `bootstrap.sh` installs them through `bootstrap_agents.sh`. Orca must have been launched once and then quit before changed profile settings can be restored. See `.orca/README.md` for a focused install command and details.

## SSH Key Setup

The repository includes an `ssh.sh` script to easily set up SSH keys for GitHub:

```sh
./ssh.sh "your.email@example.com"
```

This script will:
- Generate a new SSH key pair
- Add the key to your SSH agent
- Copy the public key to your clipboard (ready to paste into GitHub)
- Create config file with GitHub host settings

## Git Configuration

The repository includes a `github_setup.sh` script to configure your Git identity:

```sh
./github_setup.sh "Your Name" "your.email@example.com"
```

This script will:
- Set your global Git username
- Set your global Git email address

This configuration is required before making commits to ensure proper attribution of your work.

## VS Code Settings

For VS Code settings synchronization, use the built-in Settings Sync feature:

1. Click the Settings Sync button in the bottom status bar or press `Cmd + Shift + P`
2. Select "Turn on Settings Sync..."
3. Choose which settings to sync (extensions, keybindings, settings, etc.)
4. Sign in with your GitHub account to start syncing

This will keep your VS Code settings, extensions, and keybindings in sync across different machines.

## K9s Configuration

The repository includes a `.kube_config_example` file that demonstrates how to set up automatic K8s config export for k9s. Copy this example to `~/.kube/config` and modify the values according to your cluster setup. This configuration enables k9s to automatically fetch and refresh authentication tokens.
