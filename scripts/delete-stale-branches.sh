#!/usr/bin/env bash
#
# Delete remote branches that match either criteria:
#
#   1) Merged PR heads — branch name was the head ref of a merged PR into this repo, and the PR head
#      repo is this repo (not a fork). Sources: REST pulls API + GraphQL pullRequests(states:MERGED)
#      with headRepository filter (covers edge cases REST can miss).
#
#   2) Stale by age — tip commit on the branch is older than N days (UTC), even if no PR matched.
#
# Defaults to dry-run. Pass --execute to delete for real.
#
# Requirements: gh (authenticated), jq.
#
# Usage:
#   ./scripts/delete-stale-branches.sh [--dry-run | --execute] [--repo OWNER/REPO] [--days N]
#
# Examples:
#   ./scripts/delete-stale-branches.sh
#   ./scripts/delete-stale-branches.sh --execute --repo Focus-Bear/BearlyMail
#   ./scripts/delete-stale-branches.sh --days 30 --exclude-branch release --exclude-branch production
#
set -euo pipefail

REPO="${GITHUB_REPOSITORY:-Focus-Bear/BearlyMail}"
DRY_RUN=1
MAX_AGE_DAYS=21
# space-separated literal branch names to never delete
EXCLUDE_BRANCHES_DEFAULT=(main master develop gh-pages)
EXCLUDE_BRANCHES=()

usage() {
  cat <<'EOF'
Delete remote branches that:
  • Were the head branch of a merged PR (same-repository heads only — fork PR branch names are ignored), or
  • Have no qualifying merged PR but whose tip commit is older than N days.

Options:
  -h, --help                 Show this help
  -R, --repo OWNER/REPO      Repository (default: Focus-Bear/BearlyMail or $GITHUB_REPOSITORY)
  -n, --dry-run              Print planned deletions only (default)
  -x, --execute              Actually delete branches via the GitHub API
      --days N               Age threshold in days (default: 21)
      --exclude-branch NAME  Never delete this branch (repeatable). Always excludes: main master develop gh-pages

Safety:
  Default is dry-run. Use --execute only after reviewing output.

EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h | --help) usage; exit 0 ;;
    -R | --repo) REPO="$2"; shift 2 ;;
    -n | --dry-run) DRY_RUN=1; shift ;;
    -x | --execute) DRY_RUN=0; shift ;;
    --days) MAX_AGE_DAYS="$2"; shift 2 ;;
    --exclude-branch) EXCLUDE_BRANCHES+=("$2"); shift 2 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

command -v gh >/dev/null || { echo "gh is required (https://cli.github.com)" >&2; exit 1; }
command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }

if ! [[ "$MAX_AGE_DAYS" =~ ^[0-9]+$ ]] || [[ "$MAX_AGE_DAYS" -lt 1 ]]; then
  echo "--days must be a positive integer" >&2
  exit 2
fi

IFS='/' read -r REPO_OWNER REPO_NAME <<<"$REPO" || true
if [[ -z "${REPO_OWNER:-}" || -z "${REPO_NAME:-}" ]]; then
  echo "Invalid --repo (expected OWNER/REPO): $REPO" >&2
  exit 2
fi

# ISO 8601 cutoff in UTC (lexicographic compare works for GitHub's Zulu timestamps).
cutoff_iso() {
  if date -v-1d &>/dev/null; then
    date -u "-v-${MAX_AGE_DAYS}d" +%Y-%m-%dT%H:%M:%SZ
  else
    date -u -d "-${MAX_AGE_DAYS} days" +%Y-%m-%dT%H:%M:%SZ
  fi
}

CUTOFF_ISO="$(cutoff_iso)"

is_excluded_name() {
  local b="$1"
  local e i
  for e in "${EXCLUDE_BRANCHES_DEFAULT[@]}"; do
    [[ "$b" == "$e" ]] && return 0
  done
  # Bash 3.2 + set -u: iterating "${EXCLUDE_BRANCHES[@]}" when length is 0 errors ("unbound variable").
  for ((i = 0; i < ${#EXCLUDE_BRANCHES[@]}; i++)); do
    e="${EXCLUDE_BRANCHES[$i]}"
    [[ "$b" == "$e" ]] && return 0
  done
  return 1
}

echo "Repository: $REPO"
echo "Cutoff (branches with tip committed before this are stale): $CUTOFF_ISO (${MAX_AGE_DAYS} days ago, UTC)"
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "Mode: dry-run (no deletes). Use --execute to delete."
else
  echo "Mode: EXECUTE — branches will be deleted."
fi
echo

# --- Merged PR head refs (same repository only; fork PR heads are excluded) ---
MERGED_HEADS_FILE="$(mktemp)"
trap 'rm -f "$MERGED_HEADS_FILE"' EXIT

echo "Fetching merged PR head branch names (REST: pulls API)..."
gh api --paginate "repos/${REPO}/pulls?state=all&per_page=100" \
  --jq ".[] | select(.merged_at != null) | select(.head.repo != null) | select(.head.repo.full_name == \"${REPO}\") | .head.ref" \
  2>/dev/null >>"$MERGED_HEADS_FILE" || true

echo "Fetching merged PR head branch names (GraphQL: merged PRs, same-repo heads only)..."
GQL_MERGED_QUERY='
query($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequests(states: [MERGED], first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        headRefName
        headRepository { nameWithOwner }
      }
    }
  }
}'
CURSOR_M=""
while true; do
  if [[ -z "$CURSOR_M" ]]; then
    RESP_M="$(gh api graphql -f query="$GQL_MERGED_QUERY" -F owner="$REPO_OWNER" -F name="$REPO_NAME" -F cursor=null)"
  else
    RESP_M="$(gh api graphql -f query="$GQL_MERGED_QUERY" -F owner="$REPO_OWNER" -F name="$REPO_NAME" -F cursor="$CURSOR_M")"
  fi

  if echo "$RESP_M" | jq -e '.errors != null and (.errors | length) > 0' >/dev/null 2>&1; then
    echo "Warning: GraphQL merged-PR query failed; continuing with REST merged heads only." >&2
    echo "$RESP_M" | jq '.errors' >&2
    break
  fi

  echo "$RESP_M" | jq -r --arg repo "$REPO" '
    .data.repository.pullRequests.nodes[]
    | select(.headRepository != null and .headRepository.nameWithOwner == $repo)
    | .headRefName
    | select(. != null and . != "")
  ' >>"$MERGED_HEADS_FILE"

  HAS_NEXT_M="$(echo "$RESP_M" | jq -r '.data.repository.pullRequests.pageInfo.hasNextPage')"
  if [[ "$HAS_NEXT_M" != "true" ]]; then
    break
  fi
  CURSOR_M="$(echo "$RESP_M" | jq -r '.data.repository.pullRequests.pageInfo.endCursor')"
done

sort -u "$MERGED_HEADS_FILE" -o "$MERGED_HEADS_FILE"
merged_count="$(wc -l <"$MERGED_HEADS_FILE" | tr -d ' ')"
echo "Unique merged same-repo PR head branch names recorded: $merged_count"
echo

# --- All heads + tip commit dates (GraphQL) ---
BRANCH_DATA_FILE="$(mktemp)"
trap 'rm -f "$MERGED_HEADS_FILE" "$BRANCH_DATA_FILE"' EXIT

echo "Fetching branch tip commit dates..."
CURSOR=""
while true; do
  # shellcheck disable=SC2016
  QUERY='
query($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    refs(refPrefix: "refs/heads/", first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        name
        target {
          ... on Commit {
            committedDate
          }
          ... on Tag {
            target {
              ... on Commit {
                committedDate
              }
            }
          }
        }
      }
    }
  }
}'
  # Pass GraphQL variables as separate -F flags. Do not use -f variables='{...}' — gh treats that
  # as a raw string and GitHub rejects $owner / $name (see `gh api -h`: fields map to variables).
  if [[ -z "$CURSOR" ]]; then
    RESP="$(gh api graphql -f query="$QUERY" -F owner="$REPO_OWNER" -F name="$REPO_NAME" -F cursor=null)"
  else
    RESP="$(gh api graphql -f query="$QUERY" -F owner="$REPO_OWNER" -F name="$REPO_NAME" -F cursor="$CURSOR")"
  fi

  if echo "$RESP" | jq -e '.errors != null and (.errors | length) > 0' >/dev/null 2>&1; then
    echo "GitHub GraphQL error:" >&2
    echo "$RESP" | jq '.errors' >&2
    exit 1
  fi

  echo "$RESP" | jq -r '
    .data.repository.refs.nodes[]
    | .name as $n
    | (.target
        | if . == null then ""
          elif .committedDate then .committedDate
          elif (.target != null and .target.committedDate != null) then .target.committedDate
          else ""
          end) as $d
    | [$n, $d] | @tsv
  ' >>"$BRANCH_DATA_FILE"

  HAS_NEXT="$(echo "$RESP" | jq -r '.data.repository.refs.pageInfo.hasNextPage')"
  if [[ "$HAS_NEXT" != "true" ]]; then
    break
  fi
  CURSOR="$(echo "$RESP" | jq -r '.data.repository.refs.pageInfo.endCursor')"
done

branch_rows="$(wc -l <"$BRANCH_DATA_FILE" | tr -d ' ')"
echo "Branches inspected: $branch_rows"
echo

DELETE_LIST_FILE="$(mktemp)"
trap 'rm -f "$MERGED_HEADS_FILE" "$BRANCH_DATA_FILE" "$DELETE_LIST_FILE"' EXIT

merged_head_match() {
  local b="$1"
  grep -Fxq "$b" "$MERGED_HEADS_FILE" 2>/dev/null
}

while IFS=$'\t' read -r name committed_date; do
  [[ -z "$name" ]] && continue
  if is_excluded_name "$name"; then
    continue
  fi

  reason=""
  if merged_head_match "$name"; then
    reason="merged PR (head ref)"
  elif [[ -n "$committed_date" && "$committed_date" < "$CUTOFF_ISO" ]]; then
    reason="tip commit ${committed_date} older than ${MAX_AGE_DAYS} days (${CUTOFF_ISO})"
  fi

  if [[ -n "$reason" ]]; then
    printf '%s\t%s\n' "$name" "$reason" >>"$DELETE_LIST_FILE"
  fi
done <"$BRANCH_DATA_FILE"

sort -u "$DELETE_LIST_FILE" -o "$DELETE_LIST_FILE"
to_delete="$(wc -l <"$DELETE_LIST_FILE" | tr -d ' ')"

if [[ "$to_delete" -eq 0 ]]; then
  echo "No branches match delete criteria."
  exit 0
fi

echo "Branches to delete ($to_delete):"
while IFS=$'\t' read -r name reason; do
  [[ -z "$name" ]] && continue
  printf '  - %s (%s)\n' "$name" "$reason"
done <"$DELETE_LIST_FILE"
echo

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "Dry-run complete. Re-run with --execute to delete these branches."
  exit 0
fi

deleted=0
failed=0
while IFS=$'\t' read -r name _reason; do
  [[ -z "$name" ]] && continue
  enc="$(printf '%s' "$name" | jq -sRr @uri)"
  if gh api --silent --method DELETE "repos/${REPO}/git/refs/heads/${enc}"; then
    echo "Deleted: $name"
    deleted=$((deleted + 1))
  else
    echo "Failed: $name" >&2
    failed=$((failed + 1))
  fi
done <"$DELETE_LIST_FILE"

echo
echo "Done. Deleted: $deleted; failed: $failed"
[[ "$failed" -eq 0 ]]
