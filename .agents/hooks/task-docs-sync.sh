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
# Shared by Claude Code (hooks in ~/.claude/settings.json) and OMP
# (~/.omp/agent/extensions/task-docs-sync.ts).
#
# Usage:
#   task-docs-sync.sh start <session>          mark the start of a user prompt
#   task-docs-sync.sh check <session> <dir>    print the request when docs/task changed since the mark
#   task-docs-sync.sh claude-prompt            Claude Code UserPromptSubmit hook, hook JSON on stdin
#   task-docs-sync.sh claude-stop              Claude Code Stop hook, hook JSON on stdin

set -uo pipefail

readonly MARKER_DIR="${TMPDIR:-/tmp}/task-docs-sync"

# The request names what must stay, so the agent does not delete the record of finished work.
read -r -d '' REQUEST <<'EOF'
Files in docs/task/ changed in this turn. Before you end the turn, read all of progress.md and each other file in docs/task/ that tracks the same work (for example a checklist in PR_DESCRIPTION.md), and make them match the current state.
- Update: a status that is no longer true, and the checklist box of finished work (tick it).
- Remove only resolved open items, and only after their outcome is written in their home (a State line, a decision, or a context file). A risk that still applies after the step stays.
- Never delete: State lines of finished steps and their results, checklist items, decisions, or context file content. Finished work stays recorded as done.
- If you are not sure that an item is resolved, keep it and say so to the user.
If everything already matches, end the turn with no edit.
EOF

marker_path() {
  echo "$MARKER_DIR/$(printf '%s' "$1" | tr -c 'A-Za-z0-9._-' '_')"
}

start() {
  mkdir -p "$MARKER_DIR" && touch "$(marker_path "$1")"
}

check() {
  local marker root
  marker=$(marker_path "$1")
  # No mark means the hook was installed during the session: nothing to compare with.
  [ -f "$marker" ] || return 0
  root=$(git -C "$2" rev-parse --show-toplevel 2>/dev/null || echo "$2")
  [ -d "$root/docs/task" ] || return 0
  if [ -n "$(find "$root/docs/task" -type f -newer "$marker" -print -quit)" ]; then
    printf '%s\n' "$REQUEST"
  fi
}

claude_prompt() {
  local session
  session=$(jq -r '.session_id // empty')
  [ -n "$session" ] && start "$session"
  return 0
}

claude_stop() {
  local input session dir request
  input=$(cat)
  # The request blocks the stop only once, so the turn that follows it can end.
  [ "$(jq -r '.stop_hook_active // false' <<< "$input")" = "true" ] && return 0
  session=$(jq -r '.session_id // empty' <<< "$input")
  dir=$(jq -r '.cwd // empty' <<< "$input")
  [ -n "$session" ] && [ -n "$dir" ] || return 0
  request=$(check "$session" "$dir")
  [ -n "$request" ] || return 0
  jq -n --arg reason "$request" '{decision: "block", reason: $reason}'
}

case "${1:-}" in
  start) start "$2" ;;
  check) check "$2" "$3" ;;
  claude-prompt) claude_prompt ;;
  claude-stop) claude_stop ;;
  *)
    echo "Usage: $0 start <session> | check <session> <dir> | claude-prompt | claude-stop" >&2
    exit 2
    ;;
esac
