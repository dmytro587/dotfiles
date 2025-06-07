#!/bin/bash

# This script configures global Git user settings
# Usage: ./github_setup.sh "Your Name" "your.email@example.com"

set -e

git config --global user.name $1
git config --global user.email $2