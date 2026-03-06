# posthog-error-scanner

Scans PostHog for new exceptions and raises GitHub issues for urgent bugs or wrong log levels.

Implements: [Issue #669](https://github.com/Focus-Bear/BearlyMail/issues/669)  
Plan: [PR #670](https://github.com/Focus-Bear/BearlyMail/pull/670)

---

## When to Use

Run on a schedule (cron, daily or twice-daily). Admiral Roadmap should run this at **8am and 4pm UTC**.

Do NOT run during late night hours unless there's a known spike.

```bash
# Recommended cron schedule:
openclaw cron add "posthog-error-scanner" "0 8,16 * * *" \
  "Use the posthog-error-scanner skill to check for new PostHog exceptions and raise GitHub issues"
```

---

## Prerequisites

Set the following environment variables (store in `~/.openclaw/posthog-scanner.env`, never in the repo):

| Variable | Description |
|----------|-------------|
| `POSTHOG_PERSONAL_API_KEY` | PostHog personal API key with `query:read` scope. Get from: https://us.posthog.com/settings/user-api-keys#personal-api-keys |
| `POSTHOG_PROJECT_ID` | Numeric project ID from PostHog settings URL (e.g. `12345`). Ask Jeremy — visible at `https://us.posthog.com/project/{ID}/settings` |
| `GH_TOKEN` | GitHub token with `issues:write` on Focus-Bear repos (already set via codebeard-auth or admiral-roadmap-auth) |

> ⚠️ **Jeremy must provide `POSTHOG_PROJECT_ID` and `POSTHOG_PERSONAL_API_KEY` before this skill can run.**
> See the open questions section in [PR #670](https://github.com/Focus-Bear/BearlyMail/pull/670).

---

## Steps

### 1. Load env and state

```bash
# Load PostHog credentials
source ~/.openclaw/posthog-scanner.env 2>/dev/null || true

# Check required vars
if [ -z "$POSTHOG_PERSONAL_API_KEY" ] || [ -z "$POSTHOG_PROJECT_ID" ]; then
  echo "ERROR: POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID must be set."
  echo "Create ~/.openclaw/posthog-scanner.env with these values."
  exit 1
fi

# Load or create state file
STATE_FILE="$HOME/.openclaw/posthog-scanner-state.json"
if [ ! -f "$STATE_FILE" ]; then
  echo '{"lastRunAt":null,"raisedIssues":{},"falsePositives":[]}' > "$STATE_FILE"
fi
```

### 2. Query PostHog for recent exceptions

Run the helper script to fetch and classify exceptions:

```bash
node ~/.npm-global/lib/node_modules/openclaw/skills/posthog-error-scanner/scan.js
# OR from workspace install:
node /path/to/skills/posthog-error-scanner/scan.js
```

**Or invoke manually via curl for inspection:**

```bash
curl -s -X POST \
  "https://us.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/query" \
  -H "Authorization: Bearer ${POSTHOG_PERSONAL_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "query": {
      "kind": "HogQLQuery",
      "query": "SELECT properties.$exception_fingerprint AS fingerprint, properties.$exception_list[1]['\''type'\''] AS exception_type, properties.$exception_list[1]['\''value'\''] AS exception_message, properties.$exception_level AS severity, count() AS occurrences, max(timestamp) AS last_seen, min(timestamp) AS first_seen FROM events WHERE event = '\''$exception'\'' AND timestamp >= now() - INTERVAL 24 HOUR AND properties.$exception_level IS NOT NULL GROUP BY fingerprint, exception_type, exception_message, severity ORDER BY occurrences DESC LIMIT 50",
      "name": "admiral-roadmap-error-scanner"
    }
  }' | python3 -m json.tool
```

### 3. Classify each result

For each exception row returned, apply this decision tree **in order**:

1. **Already tracked?** Check `raisedIssues[fingerprint]` in state file
   - If found AND the GitHub issue is still open → **SKIP**
   - If found AND issue is closed AND occurrences ≥ 2× original count → **RE-RAISE** (link original)
   - If not found → continue

2. **Wrong log level?** If `severity` = `"warning"` or `"info"` AND `exception_type` contains typical error patterns (e.g., starts with uppercase Error type name)
   → Classify as **WRONG_LOG_LEVEL**

3. **False positive?** Check `exception_message` against noise patterns (case-insensitive regex):
   - `/✅.*loaded/i` — startup success messages
   - `/POSTHOG:.*initialized/i` — PostHog SDK noise
   - `/PostHog not initialized/i` — non-prod startup noise
   - `/net::ERR_BLOCKED_BY_CLIENT/i` — ad blockers, not our bug
   - `/ResizeObserver loop/i` — browser cosmetic error, safe to ignore
   - `/Non-Error exception captured/i` — Sentry/PostHog SDK wrapping noise
   - `/Loading chunk \d+ failed/i` — transient network error, not a code bug
   → Classify as **FALSE_POSITIVE** (log, skip issue creation)

4. **Urgent?** If `occurrences >= 10` within 24h
   → Classify as **URGENT**

5. **Critical type?** If `exception_type` is one of: `TypeError`, `ReferenceError`, `SyntaxError`, `UnhandledRejection`
   - AND `occurrences >= 3` → **URGENT**
   - AND `occurrences < 3` → **NEEDS_REVIEW**

6. **Default** → **NEEDS_REVIEW** (log only, no issue raised)

### 4. Route to correct GitHub repo

Based on the exception stack trace or available context:
- Contains `server/` or `api/` path segments → `Focus-Bear/BearlyMail`
- Contains `web_dashboard/` or React component names (`.tsx`, `.jsx` with component patterns) → `Focus-Bear/web_dashboard`
- Ambiguous → default to `Focus-Bear/BearlyMail` (note ambiguity in issue body)

### 5. Create GitHub issues (URGENT and WRONG_LOG_LEVEL only)

**For URGENT bugs:**
```bash
gh issue create \
  --repo "Focus-Bear/BearlyMail" \
  --title "[PostHog] 🔴 ${EXCEPTION_TYPE}: ${EXCEPTION_MESSAGE:0:80} (×${OCCURRENCES} in 24h)" \
  --body "$(cat <<'BODY'
## 🚨 PostHog Exception Alert

**Admiral Roadmap detected a recurring exception that needs attention.**

| Field | Value |
|-------|-------|
| Type | \`{exception_type}\` |
| Message | \`{exception_message}\` |
| Severity | \`{severity}\` |
| Occurrences | {occurrences} in last 24h |
| First seen | {first_seen} |
| Last seen | {last_seen} |
| Fingerprint | \`{fingerprint}\` |

### View in PostHog
[Open error tracking dashboard](https://us.posthog.com/error_tracking?fingerprint={fingerprint})

### Next steps
- [ ] Reproduce and root cause the error
- [ ] Fix or suppress if false positive
- [ ] Mark resolved in PostHog once fixed

---
*Auto-raised by Admiral Roadmap via PostHog error scanner. Do not edit the fingerprint — it is used for deduplication.*
<!-- posthog-fingerprint: {fingerprint} -->
BODY
)" \
  --label "bug" \
  --label "openclaw" \
  --label "posthog-auto"
```

**For WRONG_LOG_LEVEL:**
```bash
gh issue create \
  --repo "Focus-Bear/BearlyMail" \
  --title "[PostHog] ⚠️ Wrong log level: \"{exception_message:0:60}\" should not be an exception" \
  --body "$(cat <<'BODY'
## 📊 Wrong Log Level Detected

PostHog is receiving this as an **exception event**, but the message content suggests it is actually informational or a success message.

| Field | Value |
|-------|-------|
| Message | \`{exception_message}\` |
| Current level | \`{severity}\` |
| Occurrences | {occurrences} in last 24h |
| Fingerprint | \`{fingerprint}\` |

### What to do
Change the log call from \`logWarn()\`/\`console.error()\` to \`logInfo()\` or \`console.log()\` so it does not get captured as an exception by PostHog's SDK.

See [Issue #655](https://github.com/Focus-Bear/BearlyMail/issues/655) for a prior example of this pattern.

---
*Auto-raised by Admiral Roadmap via PostHog error scanner.*
<!-- posthog-fingerprint: {fingerprint} -->
BODY
)" \
  --label "bug" \
  --label "openclaw" \
  --label "posthog-auto" \
  --label "log-level"
```

**Deduplication check before creating any issue:**
```bash
# Check if issue already exists (fallback when state file is missing/corrupted)
EXISTING=$(gh issue list \
  --repo "Focus-Bear/BearlyMail" \
  --search "posthog-fingerprint: ${FINGERPRINT}" \
  --state all \
  --json number,state \
  --limit 1)
if [ -n "$EXISTING" ] && [ "$EXISTING" != "[]" ]; then
  echo "Issue already exists for fingerprint ${FINGERPRINT}, skipping."
fi
```

### 6. Update state file

After raising each issue, update `~/.openclaw/posthog-scanner-state.json`:

```json
{
  "lastRunAt": "2026-03-06T08:00:00.000Z",
  "raisedIssues": {
    "{fingerprint}": {
      "githubIssueUrl": "https://github.com/Focus-Bear/BearlyMail/issues/NNN",
      "raisedAt": "2026-03-06T08:00:00.000Z",
      "classification": "URGENT",
      "occurrencesAtRaise": 42
    }
  },
  "falsePositives": ["{fp1}", "{fp2}"]
}
```

Use `node -e` or Python to safely merge the new data (don't overwrite existing keys):

```bash
node -e "
const fs = require('fs');
const path = process.env.HOME + '/.openclaw/posthog-scanner-state.json';
const state = JSON.parse(fs.readFileSync(path, 'utf8'));
state.lastRunAt = new Date().toISOString();
state.raisedIssues['${FINGERPRINT}'] = {
  githubIssueUrl: '${ISSUE_URL}',
  raisedAt: new Date().toISOString(),
  classification: '${CLASSIFICATION}',
  occurrencesAtRaise: ${OCCURRENCES}
};
fs.writeFileSync(path, JSON.stringify(state, null, 2));
console.log('State updated.');
"
```

### 7. Report summary

Print a summary at the end of the run:

```
=== PostHog Error Scanner — Run Complete ===
🔴 URGENT:        N issues raised
⚠️  WRONG_LOG_LEVEL: N issues raised
🟢 FALSE_POSITIVE: N skipped
⏭️  NEEDS_REVIEW:  N logged only
✅ Total scanned: N exception groups
Last run at: {timestamp}
```

---

## Dry Run Mode

Before enabling the cron, run with `--dry-run` to preview what would be raised:

```bash
DRY_RUN=true node ~/.npm-global/lib/node_modules/openclaw/skills/posthog-error-scanner/scan.js
```

In dry-run mode:
- All classification logic runs normally
- No GitHub issues are created
- No state file is written
- Output shows what *would* happen

---

## Troubleshooting

**PostHog API returns 401:**
- Check `POSTHOG_PERSONAL_API_KEY` is a *personal* API key (not a project/ingestion key)
- Required scope: `query:read`
- Key must belong to a user with access to the project

**PostHog API returns 403 or empty results:**
- Verify `POSTHOG_PROJECT_ID` is correct (check PostHog URL: `https://us.posthog.com/project/{ID}/`)
- Confirm the project has `$exception` events (check PostHog Insights)

**Duplicate issues being created:**
- State file may have been deleted or corrupted
- The `gh issue list --search` fallback dedup should catch most cases
- Restore from backup or recreate `posthog-scanner-state.json` with known fingerprints

**No exceptions returned:**
- The app may have no exceptions in the last 24h (great!)
- Try extending the window to 7 days for a test: change `INTERVAL 24 HOUR` to `INTERVAL 7 DAY`

---

## Related

- [Issue #669](https://github.com/Focus-Bear/BearlyMail/issues/669) — Feature request
- [Issue #655](https://github.com/Focus-Bear/BearlyMail/issues/655) — Prior false positive (wrong log level example)
- [PR #670](https://github.com/Focus-Bear/BearlyMail/pull/670) — Implementation plan (Monk of Modularity)
- PostHog HogQL docs: https://posthog.com/docs/hogql
- PostHog personal API keys: https://us.posthog.com/settings/user-api-keys#personal-api-keys
