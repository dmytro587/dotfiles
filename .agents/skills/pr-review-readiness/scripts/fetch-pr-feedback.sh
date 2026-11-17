#!/usr/bin/env bash
# Reads all review feedback of one pull request and prints it as one JSON
# object on stdout. Read-only: it makes no change on GitHub.

set -euo pipefail

function usage() {
  cat >&2 <<'EOF'
Usage: fetch-pr-feedback.sh [--pr <number or URL>] [--repo <owner/name>]

Prints one JSON object on stdout:
  pr               number, title, url, state, base and head refs and SHAs,
                   reviewDecision, mergeable
  required_checks  required CI checks with their state ([] when none)
  reviews          review summaries (state and body)
  comments         PR conversation comments
  threads          inline review threads: id, isResolved, isOutdated, path,
                   line, comments, comments_truncated

Options:
  --pr <number or URL>   Pull request. Default: the PR of the current branch.
  --repo <owner/name>    Repository. Default: the repository of the working directory.
  --help                 Show this text.
EOF
}

# All pages of the review threads. A thread with more than 100 comments gets
# comments_truncated=true, because nested lists have no automatic paging.
function fetch_threads() {
  local -r owner="$1" repo="$2" number="$3"

  # shellcheck disable=SC2016 # GraphQL variables, not shell variables
  gh api graphql --paginate \
    -f owner="$owner" -f repo="$repo" -F number="$number" \
    -f query='
      query($owner: String!, $repo: String!, $number: Int!, $endCursor: String) {
        repository(owner: $owner, name: $repo) {
          pullRequest(number: $number) {
            reviewThreads(first: 100, after: $endCursor) {
              pageInfo { hasNextPage endCursor }
              nodes {
                id
                isResolved
                isOutdated
                path
                line
                comments(first: 100) {
                  pageInfo { hasNextPage }
                  nodes { url body author { login } createdAt }
                }
              }
            }
          }
        }
      }' \
    --jq '.data.repository.pullRequest.reviewThreads.nodes[]
      | {id, isResolved, isOutdated, path, line,
         comments: .comments.nodes,
         comments_truncated: .comments.pageInfo.hasNextPage}' |
    jq --slurp '.'
}

function main() {
  local pr="" repo=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --pr)
        pr="${2:?--pr needs a value}"
        shift 2
        ;;
      --repo)
        repo="${2:?--repo needs a value}"
        shift 2
        ;;
      --help)
        usage
        return 0
        ;;
      *)
        usage
        return 2
        ;;
    esac
  done

  command -v jq >/dev/null || {
    echo "jq is required" >&2
    return 1
  }

  local target=()
  [[ -z "$pr" ]] || target+=("$pr")
  [[ -z "$repo" ]] || target+=(--repo "$repo")

  # ${target[@]+...} keeps an empty array safe under `set -u` in bash 3.2 (macOS).
  local meta
  meta="$(gh pr view ${target[@]+"${target[@]}"} --json \
    number,title,url,state,baseRefName,headRefName,baseRefOid,headRefOid,reviewDecision,mergeable,reviews,comments)"
  readonly meta

  # `gh pr checks` exits non-zero when a check fails or is pending, and prints
  # nothing when the PR has no required checks. Both are valid results here.
  local checks
  checks="$(gh pr checks ${target[@]+"${target[@]}"} --required --json name,state,bucket 2>/dev/null || true)"
  [[ -n "$checks" ]] || checks='[]'
  readonly checks

  # The PR URL is https://github.com/<owner>/<repo>/pull/<number>.
  local owner name number
  owner="$(jq --raw-output '.url | split("/")[3]' <<<"$meta")"
  name="$(jq --raw-output '.url | split("/")[4]' <<<"$meta")"
  number="$(jq --raw-output '.number' <<<"$meta")"
  readonly owner name number

  local threads
  threads="$(fetch_threads "$owner" "$name" "$number")"
  readonly threads

  if jq --exit-status 'any(.[]; .comments_truncated)' <<<"$threads" >/dev/null; then
    echo "warning: a thread has more than 100 comments; see comments_truncated" >&2
  fi

  jq --null-input \
    --argjson meta "$meta" --argjson checks "$checks" --argjson threads "$threads" \
    '{pr: ($meta | del(.reviews, .comments)),
      required_checks: $checks,
      reviews: $meta.reviews,
      comments: $meta.comments,
      threads: $threads}'
}

main "$@"
