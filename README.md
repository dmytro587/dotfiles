# Dotfiles

Personal dotfiles and synchronization guides for macOS environment setup

## Features

- Shell configuration (zsh with Oh My Zsh)
- Git SSH key setup
- Homebrew packages and apps
- Node.js environment (via nvm)
- Development tools configuration
- VS Code extensions

## Installation

1. Clone this repository:
```sh
git clone https://github.com/yourusername/dotfiles.git
cd dotfiles
```

2. Run the bootstrap script:
```sh
./bootstrap.sh
```

This will:
- Install Homebrew if not present
- Install packages from Brewfile
- Install Oh My Zsh
- Copy dotfiles to your home directory

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

## VS Code Settings

For VS Code settings synchronization, use the built-in Settings Sync feature:

1. Click the Settings Sync button in the bottom status bar or press `Cmd + Shift + P`
2. Select "Turn on Settings Sync..."
3. Choose which settings to sync (extensions, keybindings, settings, etc.)
4. Sign in with your GitHub account to start syncing

This will keep your VS Code settings, extensions, and keybindings in sync across different machines.