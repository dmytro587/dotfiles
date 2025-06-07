# /bin/bash

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
cp ./.* $HOME

source $HOME/.zshrc