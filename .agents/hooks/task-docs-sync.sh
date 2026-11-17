#!/bin/bash
#
# Asks the agent, once per user prompt, to bring the task files in ./docs/task/ in line
# with the current state when one of them changed during the turn.
#
# Agents edit these files one line at a time when a step changes, and then miss the
# other records that the same change resolves (open questions, checklist boxes in
# other files). The check runs at the end of the turn, so it sees every edit method,
# including shell edits.
#
# It also tells the agent at session start that the worktree has ./docs/task/, so the
# load of the tracking-task-progress skill does not depend on the agent's memory.
#
# Shared by Claude Code (hooks in ~/.claude/settings.json) and OMP
# (~/.omp/agent/extensions/task-docs-sync.ts).
#
# Usage:
#   task-docs-sync.sh start <session>          mark the start of a user prompt
#   task-docs-sync.sh check <session> <dir>    print the request when docs/task changed since the mark
#   task-docs-sync.sh notice <dir>             print the session-start notice when docs/task exists
#   task-docs-sync.sh claude-prompt            Claude Code UserPromptSubmit hook, hook JSON on stdin
#   task-docs-sync.sh claude-stop              Claude Code Stop hook, hook JSON on stdin
#   task-docs-sync.sh claude-session-start     Claude Code SessionStart hook, hook JSON on stdin

set -uo pipefail

readonly MARKER_DIR="${TMPDIR:-/tmp}/task-docs-sync"

# The request points to the skill, which holds the full rules. It repeats only the
# rules that agents break most: what to update, and what must stay.
read -r -d '' REQUEST <<'EOF'
Files in docs/task/ changed in this turn. Before you end the turn, follow the `tracking-task-progress` skill (load it if it is not loaded): read all of progress.md and each other file in docs/task/ that tracks the same work (for example a checklist in PR_DESCRIPTION.md), and make them match the current state.
- Update: Next action, a status that is no longer true, and the checklist box of finished work (tick it). If a file moved, update the links to it.
- Replace a record that changed. Do not add a second record next to it.
- Remove a record only where the skill says so, and only after its outcome is written in its home (a State line, a decision, or a context file): a resolved open item, a temporary decision whose "Until" step or event happened, a risk that a confirmed mitigation removed. A risk that still applies after the step stays.
- Never delete the record of finished work: State lines of finished steps and their results, checklist items, decisions that still hold, or context file content.
- If you are not sure that an item is resolved, keep it and say so to the user.
EOF
readonly REQUEST

readonly CLOSING='If everything already matches, end the turn with no edit.'

# Added only for a PR review workspace, so other tasks do not get it.
read -r -d '' REVIEW_REQUEST <<'EOF'
This is a PR review (docs/task/review/, see the `tracking-pr-reviews` skill). When a finding or a decision changed, also bring these in line in the same turn:
- requested-changes-comments.md: rewrite or remove the comment of that finding. The file holds only text that is still to be posted.
- github-state.md: the state of each requested change on the PR (open, fixed, withdrawn, or reversed in the discussion).
EOF
readonly REVIEW_REQUEST

readonly SESSION_NOTICE='This worktree has a ./docs/task/ folder. Before other work, load the `tracking-task-progress` skill and read ./docs/task/progress.md. If progress.md does not exist, ask the user.'

function marker_path() {
  echo "$MARKER_DIR/$(printf '%s' "$1" | tr -c 'A-Za-z0-9._-' '_')"
}

# The worktree root of <dir>, or <dir> itself outside a git repository.
function worktree_root() {
  git -C "$1" rev-parse --show-toplevel 2>/dev/null || echo "$1"
}

function start() {
  mkdir -p "$MARKER_DIR" && touch "$(marker_path "$1")"
}

function check() {
  local marker root
  marker=$(marker_path "$1")
  readonly marker
  # No mark means the hook was installed during the session: nothing to compare with.
  [ -f "$marker" ] || return 0
  root=$(worktree_root "$2")
  readonly root
  [ -d "$root/docs/task" ] || return 0
  # Directories are included on purpose: a move or a delete changes the time of the
  # folder, but not the time of a file.
  if [ -n "$(find "$root/docs/task" -newer "$marker" -print -quit)" ]; then
    printf '%s\n' "$REQUEST"
    if [ -d "$root/docs/task/review" ]; then
      printf '%s\n' "$REVIEW_REQUEST"
    fi
    printf '%s\n' "$CLOSING"
  fi
}

function notice() {
  local root
  root=$(worktree_root "$1")
  readonly root
  [ -d "$root/docs/task" ] || return 0
  printf '%s\n' "$SESSION_NOTICE"
}

function claude_prompt() {
  local session
  session=$(jq -r '.session_id // empty')
  readonly session
  [ -n "$session" ] && start "$session"
  return 0
}

function claude_stop() {
  local input session dir request
  input=$(cat)
  readonly input
  session=$(jq -r '.session_id // empty' <<< "$input")
  dir=$(jq -r '.cwd // empty' <<< "$input")
  readonly session dir
  [ -n "$session" ] && [ -n "$dir" ] || return 0
  # The request blocks the stop only once, so the turn that follows it can end. That
  # turn made the files match, so the mark moves here. Without this, a later turn that
  # starts with no user prompt (a background task notice, a scheduled wake-up) gets the
  # same request again.
  if [ "$(jq -r '.stop_hook_active // false' <<< "$input")" = "true" ]; then
    start "$session"
    return 0
  fi
  request=$(check "$session" "$dir")
  readonly request
  [ -n "$request" ] || return 0
  jq -n --arg reason "$request" '{decision: "block", reason: $reason}'
}

function claude_session_start() {
  local dir
  dir=$(jq -r '.cwd // empty')
  readonly dir
  [ -n "$dir" ] || return 0
  # Claude Code adds the stdout of a SessionStart hook to the context.
  notice "$dir"
}

case "${1:-}" in
  start) start "$2" ;;
  check) check "$2" "$3" ;;
  notice) notice "$2" ;;
  claude-prompt) claude_prompt ;;
  claude-stop) claude_stop ;;
  claude-session-start) claude_session_start ;;
  *)
    echo "Usage: $0 start <session> | check <session> <dir> | notice <dir> | claude-prompt | claude-stop | claude-session-start" >&2
    exit 2
    ;;
esac
