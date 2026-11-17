#!/bin/bash

# Tests of .agents/hooks/task-docs-sync.sh. They run on the host: the hook only reads
# file times and writes its marks in TMPDIR, which points to a temporary folder here.
#
# Usage: bash tests/hooks/task-docs-sync.test.sh

set -uo pipefail

readonly HOOK="$(cd "$(dirname "$0")/../.." && pwd)/.agents/hooks/task-docs-sync.sh"
readonly SESSION="test-session"

WORK_DIR="$(mktemp -d)"
readonly WORK_DIR
readonly REPO_DIR="$WORK_DIR/repo"
readonly TASK_DIR="$REPO_DIR/docs/task"
export TMPDIR="$WORK_DIR/tmp"

pass_count=0
fail_count=0

function cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

# Print PASS or FAIL for one check. The arguments after the name are the command to run.
function check() {
  local -r name="$1"
  shift
  if "$@"; then
    echo "PASS $name"
    pass_count=$((pass_count + 1))
  else
    echo "FAIL $name"
    fail_count=$((fail_count + 1))
  fi
}

# Some filesystems store coarse file times. The pause keeps a change after a mark newer than the mark.
function pause() {
  sleep 0.1
}

function hook_input() {
  jq --compact-output --null-input \
    --arg session "$SESSION" --arg cwd "$REPO_DIR" --argjson active "$1" \
    '{session_id: $session, cwd: $cwd, stop_hook_active: $active}'
}

function submit_prompt() {
  hook_input false | bash "$HOOK" claude-prompt
  pause
}

# Succeeds when the Stop hook blocks. The argument is the value of stop_hook_active.
function stop_blocks() {
  local output
  output="$(hook_input "$1" | bash "$HOOK" claude-stop)"
  readonly output
  [[ "$(jq --raw-output '.decision // empty' <<<"$output" 2>/dev/null)" == "block" ]]
}

function stop_passes() {
  ! stop_blocks "$1"
}

function main() {
  mkdir -p "$TASK_DIR/research" "$TMPDIR"
  touch "$TASK_DIR/progress.md" "$TASK_DIR/research/notes.md"

  check "no mark: stop passes" stop_passes false

  submit_prompt
  check "no change: stop passes" stop_passes false

  echo "state changed" >>"$TASK_DIR/progress.md"
  check "edit: stop blocks" stop_blocks false
  check "turn after the request: stop passes" stop_passes true
  pause
  check "next stop with no new prompt: stop passes" stop_passes false

  echo "state changed again" >>"$TASK_DIR/progress.md"
  check "later edit with no new prompt: stop blocks" stop_blocks false

  submit_prompt
  check "new prompt: stop passes" stop_passes false

  mv "$TASK_DIR/research/notes.md" "$TASK_DIR/notes.md"
  check "file moved: stop blocks" stop_blocks false

  submit_prompt
  rm "$TASK_DIR/notes.md"
  check "file deleted: stop blocks" stop_blocks false

  submit_prompt
  mkdir -p "$REPO_DIR/src"
  touch "$REPO_DIR/src/code.ts"
  check "change outside docs/task: stop passes" stop_passes false

  check "session start with docs/task: notice names the skill" \
    grep --quiet "tracking-task-progress" <(hook_input false | bash "$HOOK" claude-session-start)

  check "session start without docs/task: no output" \
    test -z "$(bash "$HOOK" notice "$WORK_DIR")"

  echo "$pass_count passed, $fail_count failed"
  [[ "$fail_count" -eq 0 ]]
}

main "$@"
