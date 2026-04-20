#!/usr/bin/env bash
#
# Thin wrapper — implementation is scripts/pr-claude-triage.mjs (Node.js).
# Keeps historical path ./scripts/pr-claude-triage.sh working for cron and docs.
#
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "${SCRIPT_DIR}/pr-claude-triage.mjs" "$@"
