#!/usr/bin/env bash

if [ -z "$1" ]; then
  echo "Usage: $0 '<project-name-glob>'"
  echo "Examples:"
  echo "  $0 'my-repository-*'            # quote to let the script expand"
  echo "  $0 ../../my-repository-*        # your shell may expand into multiple args"
  exit 1
fi

# If the caller's shell already expanded a glob, we may receive multiple args.
# Treat them as explicit directories/patterns to include.
PATTERN=$1
# Default base directory to the parent of the dotfiles repo
BASE_DIR="${BASE_DIR:-$HOME/Documents/www}"

# Find projects matching the pattern(s)
projects=()
# Using bash glob expansion. If the pattern includes a path separator,
# treat it as a path glob as-is; otherwise, prefix with BASE_DIR.
shopt -s nullglob
if [ "$#" -gt 1 ]; then
  for dir in "$@"; do
    if [ -d "$dir" ]; then
      projects+=("$dir")
    fi
  done
  search_glob="$*"
else
  if [[ "$PATTERN" == *"/"* ]]; then
    search_glob=$PATTERN
  else
    search_glob="$BASE_DIR/$PATTERN"
  fi

  for dir in $search_glob; do
    if [ -d "$dir" ]; then
      projects+=("$dir")
    fi
  done
fi
shopt -u nullglob

if [ ${#projects[@]} -eq 0 ]; then
  echo "No projects found matching '$PATTERN'."
  echo "Tried: $search_glob"
  exit 1
fi

echo "======================================"
echo "Found ${#projects[@]} projects:"
for i in "${!projects[@]}"; do
  echo "[$i] $(basename "${projects[$i]}")"
done
echo "======================================"
echo ""

# Choose the main project
echo "Select the main project to sync FROM (enter number):"
read -r main_idx

if ! [[ "$main_idx" =~ ^[0-9]+$ ]] || [ -z "${projects[$main_idx]}" ]; then
  echo "Invalid selection."
  exit 1
fi

MAIN_DIR="${projects[$main_idx]}"
MAIN_FILE="$MAIN_DIR/.claude/CLAUDE.md"

if [ ! -f "$MAIN_FILE" ]; then
  echo "Error: The selected main project does not have a .claude/CLAUDE.md file!"
  exit 1
fi

echo ""
echo "Main project selected: $(basename "$MAIN_DIR")"
echo "--------------------------------------"

# Display diff summary and open files
echo "Changes summary (relative to main):"
for dir in "${projects[@]}"; do
  TARGET_FILE="$dir/.claude/CLAUDE.md"
  
  if [ "$dir" != "$MAIN_DIR" ]; then
    if [ ! -f "$TARGET_FILE" ]; then
      echo "  $(basename "$dir"): File is missing (will be created)"
    else
      # Calculate diff
      diff_output=$(diff -U 0 "$MAIN_FILE" "$TARGET_FILE" 2>/dev/null | grep -E '^[+-]' | grep -v '^---' | grep -v '^\+\+\+')
      if [ -z "$diff_output" ]; then
        echo "  $(basename "$dir"): 0 differences (files are identical)"
      else
        additions=$(echo "$diff_output" | grep -c '^+')
        deletions=$(echo "$diff_output" | grep -c '^-')
        echo "  $(basename "$dir"): +${additions} -${deletions} lines"
      fi
    fi
  else
    echo "  $(basename "$dir"): (MAIN)"
  fi
  
  # Open the file for the user to review if it exists
  if [ -f "$TARGET_FILE" ]; then
    if command -v code >/dev/null 2>&1; then
      code "$TARGET_FILE"
    else
      open "$TARGET_FILE"
    fi
  fi
done
echo "--------------------------------------"
echo ""

# Ask for sync
read -p "Sync? (overwrites other CLAUDE.md files with the main one) [Yes/No]: " confirm
if [[ "${confirm}" =~ ^[Yy](es)?$ ]]; then
  echo ""
  for dir in "${projects[@]}"; do
    if [ "$dir" != "$MAIN_DIR" ]; then
      mkdir -p "$dir/.claude"
      cp "$MAIN_FILE" "$dir/.claude/CLAUDE.md"
      echo "✅ Synced to $(basename "$dir")"
    fi
  done
  echo "Sync complete!"
else
  echo "Sync cancelled."
fi
