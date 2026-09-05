#!/bin/bash
# Install local OMP plugins declared in plugins.json (same directory).
#
# Entry fields:
#   source     path to the local plugin checkout; "~" prefix allowed
#   sourceEnv  optional environment variable that overrides source
#   targets    list of "user" or "profile:<name>"
#
# omp plugin link is idempotent, so re-runs are safe.
set -u
cd "$(dirname "$0")"

for tool in jq omp; do
  command -v "$tool" >/dev/null 2>&1 || { echo "error: $tool is required" >&2; exit 1; }
done

errors=0

while IFS=$'\t' read -r name source env_var targets; do
  override=""
  [ -n "$env_var" ] && override="${!env_var-}"
  [ -n "$override" ] && source="$override"
  source="${source/#\~/$HOME}"

  if [ ! -d "$source" ]; then
    echo "error: $name: source not found: $source" >&2
    errors=$((errors + 1))
    continue
  fi

  IFS=, read -r -a target_list <<< "$targets"
  for target in "${target_list[@]}"; do
    case "$target" in
      user)
        omp plugin link "$source" || { errors=$((errors + 1)); continue; }
        ;;
      profile:*)
        OMP_PROFILE="${target#profile:}" omp plugin link "$source" || { errors=$((errors + 1)); continue; }
        ;;
      *)
        echo "error: $name: unknown target: $target" >&2
        errors=$((errors + 1))
        continue
        ;;
    esac
    echo "$name [$target]: linked"
  done
done < <(jq -r 'to_entries[] | [.key, .value.source, (.value.sourceEnv // ""), ((.value.targets // []) | join(","))] | @tsv' plugins.json)
[ "$errors" -eq 0 ] || exit 1
