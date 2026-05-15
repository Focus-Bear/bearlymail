#!/usr/bin/env bash
#
# Install / uninstall the launchd agent that runs pr-claude-triage.sh every 10 minutes
# from 09:00 to 16:50 local time, Monday through Friday. Resolvers run on this machine,
# so the machine must be awake and connected during business hours for the cron to fire.
#
# Usage:
#   scripts/pr-claude-triage/cron/install-cron.sh install    # install + load
#   scripts/pr-claude-triage/cron/install-cron.sh uninstall  # unload + remove
#   scripts/pr-claude-triage/cron/install-cron.sh status     # current load state
#   scripts/pr-claude-triage/cron/install-cron.sh tail       # live-tail today's log
#
# Notes:
#   - launchd's `StartCalendarInterval` runs in the machine's *local* timezone. The
#     cron times below assume your Mac's clock is set to Australia/Melbourne. If you
#     travel and change timezones, the schedule shifts with it.
#   - The log directory is ~/Library/Logs/pr-claude-triage/ ; one file per UTC date.
#
set -euo pipefail

LABEL="io.focusbear.pr-triage"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${HERE}/../../.." && pwd)"
WRAPPER="${HERE}/run-triage.sh"
PLIST_PATH="${HOME}/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="${HOME}/Library/Logs/pr-claude-triage"

mkdir -p "${HOME}/Library/LaunchAgents" "${LOG_DIR}"

cmd="${1:-install}"

case "${cmd}" in
  install)
    if [[ ! -x "${WRAPPER}" ]]; then
      chmod +x "${WRAPPER}"
    fi

    # Resolve the user's actual `node`, `claude`, and `gh` binaries by asking their interactive
    # login shell. This catches version-manager installs (nvm / fnm / volta / asdf) whose paths
    # live under ~/.nvm/versions/node/vXX/bin etc. — directories that aren't on the minimal PATH
    # launchd hands the wrapper. We then bake those dirs into the plist's EnvironmentVariables.PATH
    # so launchctl-spawned ticks find the same binaries you'd run from your terminal.
    user_shell="${SHELL:-/bin/zsh}"
    discovered_paths=""
    discover_dir() {
      local name="$1"
      # Use a login shell so the user's shell rc files (zshrc / bashrc + nvm.sh) get sourced.
      local resolved
      resolved="$("${user_shell}" -l -i -c "command -v ${name} 2>/dev/null" 2>/dev/null || true)"
      # Strip ANSI / prompt junk that some shells inject in interactive mode.
      resolved="$(echo "${resolved}" | tr -d '\r' | tail -1)"
      if [[ -n "${resolved}" && -x "${resolved}" ]]; then
        local dir
        dir="$(cd "$(dirname "${resolved}")" && pwd)"
        echo "  resolved ${name}: ${resolved}"
        discovered_paths+=":${dir}"
      else
        echo "  ! could not resolve '${name}' via ${user_shell} -l -i; ticks may fail to find it"
      fi
    }
    echo "Resolving runtime binaries via ${user_shell} login shell..."
    discover_dir node
    discover_dir claude
    discover_dir gh
    # Order: user-discovered dirs first, then standard system + homebrew fallbacks.
    runtime_path="${discovered_paths#:}:${HOME}/.local/bin:${HOME}/.npm-global/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

    # Build the StartCalendarInterval array: every 10 minutes from 09:00 through 16:50.
    # That is 8 hours × 6 ten-minute slots = 48 fires per workday, Mon-Fri.
    intervals=""
    for hour in 9 10 11 12 13 14 15 16; do
      for minute in 0 10 20 30 40 50; do
        for weekday in 1 2 3 4 5; do
          intervals+=$'\t\t<dict>\n'
          intervals+=$'\t\t\t<key>Hour</key><integer>'"${hour}"$'</integer>\n'
          intervals+=$'\t\t\t<key>Minute</key><integer>'"${minute}"$'</integer>\n'
          intervals+=$'\t\t\t<key>Weekday</key><integer>'"${weekday}"$'</integer>\n'
          intervals+=$'\t\t</dict>\n'
        done
      done
    done

    cat > "${PLIST_PATH}" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>${LABEL}</string>

	<key>ProgramArguments</key>
	<array>
		<string>/bin/bash</string>
		<string>${WRAPPER}</string>
	</array>

	<key>WorkingDirectory</key>
	<string>${REPO_DIR}</string>

	<key>EnvironmentVariables</key>
	<dict>
		<key>HOME</key>
		<string>${HOME}</string>
		<key>PATH</key>
		<string>${runtime_path}</string>
	</dict>

	<key>StandardOutPath</key>
	<string>${LOG_DIR}/launchd-stdout.log</string>
	<key>StandardErrorPath</key>
	<string>${LOG_DIR}/launchd-stderr.log</string>

	<key>RunAtLoad</key>
	<false/>

	<key>StartCalendarInterval</key>
	<array>
${intervals}	</array>
</dict>
</plist>
PLIST

    # Reload (unload then load) to pick up any change to the schedule.
    launchctl unload "${PLIST_PATH}" 2>/dev/null || true
    launchctl load "${PLIST_PATH}"

    echo "Installed: ${PLIST_PATH}"
    echo "  schedule: every 10 minutes, 09:00–16:50 local time, Mon–Fri"
    echo "  wrapper:  ${WRAPPER}"
    echo "  logs:     ${LOG_DIR}/triage-YYYY-MM-DD.log"
    echo ""
    echo "To run a one-off tick now (without waiting for the schedule):"
    echo "  launchctl start ${LABEL}"
    echo "Then watch the log:"
    echo "  $(basename "$0") tail"
    ;;

  uninstall)
    if [[ -f "${PLIST_PATH}" ]]; then
      launchctl unload "${PLIST_PATH}" 2>/dev/null || true
      rm -f "${PLIST_PATH}"
      echo "Uninstalled: ${PLIST_PATH}"
    else
      echo "Not installed (no plist at ${PLIST_PATH})"
    fi
    ;;

  status)
    if [[ -f "${PLIST_PATH}" ]]; then
      echo "Plist: ${PLIST_PATH}"
      launchctl list | grep -E "(${LABEL}|^PID)" || echo "  not currently loaded"
    else
      echo "Not installed (no plist at ${PLIST_PATH})"
    fi
    ;;

  tail)
    today_log="${LOG_DIR}/triage-$(date -u +%Y-%m-%d).log"
    if [[ ! -f "${today_log}" ]]; then
      echo "No log for today yet at ${today_log}"
      echo "Tailing the launchd stdout/stderr files instead:"
      exec tail -F "${LOG_DIR}/launchd-stdout.log" "${LOG_DIR}/launchd-stderr.log"
    fi
    exec tail -F "${today_log}"
    ;;

  *)
    echo "Usage: $0 {install|uninstall|status|tail}" >&2
    exit 2
    ;;
esac
