#!/usr/bin/env bash
#
# Cron wrapper: invoked by launchd (see io.focusbear.pr-triage.plist) every 10 minutes
# during business hours. Runs pr-claude-triage.sh with stdout+stderr appended to a
# timestamped log file under ~/Library/Logs/pr-claude-triage/.
#
# Idempotent: if a previous tick is still running (script took longer than the 10-minute
# interval), this run exits early so we don't fire two cron processes against the same
# clone. Per-PR locking is handled inside the resolvers themselves (see resolver-lock.mjs).
#
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
LOG_DIR="${HOME}/Library/Logs/pr-claude-triage"
RUN_LOCK="${LOG_DIR}/.cron-run.lock"

mkdir -p "${LOG_DIR}"

# Make sure user-installed CLIs are on PATH (claude, gh, node, etc.). install-cron.sh
# resolves the actual node / claude / gh dirs by running the user's login shell at install
# time and bakes them into the plist's EnvironmentVariables.PATH; the appends below are a
# fallback for the case where someone hand-edits the plist or installs a new tool later.
# Order matters: the plist's PATH (with version-manager dirs like ~/.nvm/...) stays first.
export PATH="${PATH}:${HOME}/.local/bin:${HOME}/.npm-global/bin:/opt/homebrew/bin:/usr/local/bin"

# Best-effort previous-run lock: if another instance is running, log and exit. The lock
# file holds the previous PID.
if [[ -f "${RUN_LOCK}" ]]; then
  prev_pid="$(cat "${RUN_LOCK}" 2>/dev/null || true)"
  if [[ -n "${prev_pid}" ]] && kill -0 "${prev_pid}" 2>/dev/null; then
    echo "[$(date -Iseconds)] previous tick (pid ${prev_pid}) still running; skipping" \
      >> "${LOG_DIR}/cron.log"
    exit 0
  fi
fi
echo "$$" > "${RUN_LOCK}"
trap 'rm -f "${RUN_LOCK}"' EXIT

cd "${REPO_DIR}"

# One log file per UTC day (so launchd doesn't accumulate one giant file forever).
LOG_FILE="${LOG_DIR}/triage-$(date -u +%Y-%m-%d).log"

{
  echo ""
  echo "=== run started $(date -Iseconds) (pid $$) ==="
  ./scripts/pr-claude-triage.sh "$@"
  echo "=== run finished $(date -Iseconds) ==="
} >> "${LOG_FILE}" 2>&1
