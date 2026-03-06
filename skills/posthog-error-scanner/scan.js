#!/usr/bin/env node
/**
 * posthog-error-scanner/scan.js
 *
 * Queries PostHog for recent exceptions, classifies them, and raises
 * GitHub issues for URGENT and WRONG_LOG_LEVEL cases.
 *
 * Implements: Focus-Bear/BearlyMail#669
 * Plan: Focus-Bear/BearlyMail#670
 *
 * Usage:
 *   node scan.js [--dry-run]
 *
 * Required environment variables:
 *   POSTHOG_PERSONAL_API_KEY  — PostHog personal API key (query:read scope)
 *   POSTHOG_PROJECT_ID        — Numeric PostHog project ID
 *   GH_TOKEN                  — GitHub token (issues:write on Focus-Bear repos)
 *
 * Optional:
 *   POSTHOG_LOOKBACK_HOURS    — Hours to look back (default: 24)
 *   POSTHOG_RESULT_LIMIT      — Max exception groups to fetch (default: 50)
 *   POSTHOG_URGENT_THRESHOLD  — Occurrences/24h to trigger URGENT (default: 10)
 *   POSTHOG_HOST              — PostHog host (default: us.posthog.com)
 *   DEFAULT_GITHUB_REPO       — Fallback repo for issues (default: Focus-Bear/BearlyMail)
 *   STATE_FILE                — Path to state JSON (default: ~/.openclaw/posthog-scanner-state.json)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawnSync } = require('child_process');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DRY_RUN = process.env.DRY_RUN === 'true' || process.argv.includes('--dry-run');

const POSTHOG_API_KEY = process.env.POSTHOG_PERSONAL_API_KEY;
const POSTHOG_PROJECT_ID = process.env.POSTHOG_PROJECT_ID;
const POSTHOG_HOST = process.env.POSTHOG_HOST || 'us.posthog.com';
const LOOKBACK_HOURS = parseInt(process.env.POSTHOG_LOOKBACK_HOURS || '24', 10);
const RESULT_LIMIT = parseInt(process.env.POSTHOG_RESULT_LIMIT || '50', 10);
const URGENT_THRESHOLD = parseInt(process.env.POSTHOG_URGENT_THRESHOLD || '10', 10);
const DEFAULT_REPO = process.env.DEFAULT_GITHUB_REPO || 'Focus-Bear/BearlyMail';
const STATE_FILE = process.env.STATE_FILE ||
  path.join(process.env.HOME || '/root', '.openclaw', 'posthog-scanner-state.json');

// ---------------------------------------------------------------------------
// Classification constants
// ---------------------------------------------------------------------------

const CRITICAL_EXCEPTION_TYPES = new Set([
  'TypeError', 'ReferenceError', 'SyntaxError', 'UnhandledRejection',
  'RangeError', 'URIError', 'EvalError',
]);

const FALSE_POSITIVE_PATTERNS = [
  /✅.*loaded/i,
  /POSTHOG:.*initialized/i,
  /PostHog not initialized/i,
  /net::ERR_BLOCKED_BY_CLIENT/i,
  /ResizeObserver loop/i,
  /Non-Error exception captured/i,
  /Loading chunk \d+ failed/i,
  /Script error\./i,
];

const CLASSIFICATIONS = {
  URGENT: 'URGENT',
  WRONG_LOG_LEVEL: 'WRONG_LOG_LEVEL',
  FALSE_POSITIVE: 'FALSE_POSITIVE',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
};

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function log(msg) {
  console.log(`[posthog-scanner] ${msg}`);
}

function httpsPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const options = {
      hostname,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...headers,
      },
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(raw));
          } catch (e) {
            resolve(raw);
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${raw}`));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function loadState() {
  const dir = path.dirname(STATE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(STATE_FILE)) {
    const initial = { lastRunAt: null, raisedIssues: {}, falsePositives: [] };
    fs.writeFileSync(STATE_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (e) {
    log(`WARNING: Could not parse state file: ${e.message}. Starting fresh.`);
    return { lastRunAt: null, raisedIssues: {}, falsePositives: [] };
  }
}

function saveState(state) {
  if (DRY_RUN) {
    log('[dry-run] Would save state file.');
    return;
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ---------------------------------------------------------------------------
// PostHog query
// ---------------------------------------------------------------------------

async function fetchExceptions() {
  if (!POSTHOG_API_KEY) {
    throw new Error('POSTHOG_PERSONAL_API_KEY is not set. Cannot query PostHog.');
  }
  if (!POSTHOG_PROJECT_ID) {
    throw new Error('POSTHOG_PROJECT_ID is not set. Cannot query PostHog.');
  }

  const hogqlQuery = `
SELECT
  properties.$exception_fingerprint AS fingerprint,
  properties.$exception_list[1]['type'] AS exception_type,
  properties.$exception_list[1]['value'] AS exception_message,
  properties.$exception_level AS severity,
  count() AS occurrences,
  max(timestamp) AS last_seen,
  min(timestamp) AS first_seen
FROM events
WHERE event = '$exception'
  AND timestamp >= now() - INTERVAL ${LOOKBACK_HOURS} HOUR
  AND properties.$exception_level IS NOT NULL
GROUP BY fingerprint, exception_type, exception_message, severity
ORDER BY occurrences DESC
LIMIT ${RESULT_LIMIT}
  `.trim();

  log(`Querying PostHog (project ${POSTHOG_PROJECT_ID}, last ${LOOKBACK_HOURS}h)...`);

  const result = await httpsPost(
    POSTHOG_HOST,
    `/api/projects/${POSTHOG_PROJECT_ID}/query`,
    { Authorization: `Bearer ${POSTHOG_API_KEY}` },
    {
      query: {
        kind: 'HogQLQuery',
        query: hogqlQuery,
        name: 'admiral-roadmap-error-scanner',
      },
    }
  );

  // HogQL returns { results: [[col0, col1, ...], ...], columns: [...] }
  const rows = result.results || [];
  const columns = result.columns || ['fingerprint', 'exception_type', 'exception_message', 'severity', 'occurrences', 'last_seen', 'first_seen'];

  return rows.map((row) => {
    const obj = {};
    columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj;
  });
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

function classify(exception, state) {
  const { fingerprint, exception_type, exception_message, severity, occurrences } = exception;
  const message = String(exception_message || '');

  // 1. Already raised and issue still open?
  const existing = state.raisedIssues[fingerprint];
  if (existing) {
    // Check if we should re-raise (issue closed + occurrences spiked)
    try {
      const issueNum = existing.githubIssueUrl.split('/').pop();
      const repo = existing.githubIssueUrl.includes('web_dashboard') ? 'Focus-Bear/web_dashboard' : DEFAULT_REPO;
      const ghResult = spawnSync(
        'gh', ['issue', 'view', issueNum, '--repo', repo, '--json', 'state', '-q', '.state'],
        { env: { ...process.env }, encoding: 'utf8' }
      );
      if (ghResult.status !== 0) throw new Error(ghResult.stderr || ghResult.stdout);
      const issueState = ghResult.stdout.trim();

      if (issueState === 'OPEN') {
        return { classification: 'SKIP', reason: 'Issue already open in GitHub' };
      }

      // Issue closed — check for spike
      const spike = occurrences >= (existing.occurrencesAtRaise || 0) * 2 && occurrences >= 3;
      if (spike) {
        return { classification: existing.classification, reason: 'Re-raise: issue closed but occurrences spiked', reRaise: true, existingIssueUrl: existing.githubIssueUrl };
      }

      return { classification: 'SKIP', reason: 'Issue closed, no spike' };
    } catch (_) {
      // If gh check fails, fall through to normal classification
    }
  }

  // 1b. In false positives list?
  if (state.falsePositives && state.falsePositives.includes(fingerprint)) {
    return { classification: CLASSIFICATIONS.FALSE_POSITIVE, reason: 'In state falsePositives list' };
  }

  // 2. Wrong log level?
  const wrongLevelSeverities = ['warning', 'info', 'debug', 'log'];
  if (wrongLevelSeverities.includes(String(severity).toLowerCase())) {
    // Severity is low, but it still got captured as a $exception — flag it
    return { classification: CLASSIFICATIONS.WRONG_LOG_LEVEL, reason: `Severity '${severity}' should not generate $exception events` };
  }

  // 3. False positive patterns?
  for (const pattern of FALSE_POSITIVE_PATTERNS) {
    if (pattern.test(message)) {
      return { classification: CLASSIFICATIONS.FALSE_POSITIVE, reason: `Matches noise pattern: ${pattern}` };
    }
  }

  // 4. Urgent by volume?
  if (occurrences >= URGENT_THRESHOLD) {
    return { classification: CLASSIFICATIONS.URGENT, reason: `High volume: ${occurrences} occurrences >= threshold ${URGENT_THRESHOLD}` };
  }

  // 5. Critical exception type?
  if (CRITICAL_EXCEPTION_TYPES.has(exception_type)) {
    if (occurrences >= 3) {
      return { classification: CLASSIFICATIONS.URGENT, reason: `Critical exception type '${exception_type}' with ${occurrences} occurrences` };
    }
    return { classification: CLASSIFICATIONS.NEEDS_REVIEW, reason: `Critical exception type '${exception_type}' but low volume (${occurrences})` };
  }

  // 6. Default
  return { classification: CLASSIFICATIONS.NEEDS_REVIEW, reason: `Unknown/low-volume exception (${occurrences} occurrences)` };
}

// ---------------------------------------------------------------------------
// Repo routing
// ---------------------------------------------------------------------------

function routeRepo(exception) {
  // In the absence of a stack trace in the HogQL query result, default to BearlyMail.
  // If the exception has a $exception_list with stack frames, they'd be checked here.
  // TODO: extend the HogQL query to include stack trace snippets for better routing.
  return DEFAULT_REPO;
}

// ---------------------------------------------------------------------------
// GitHub issue creation
// ---------------------------------------------------------------------------

function buildUrgentBody(ex) {
  const { fingerprint, exception_type, exception_message, severity, occurrences, first_seen, last_seen } = ex;
  const msg = String(exception_message || '').substring(0, 200);
  return `## 🚨 PostHog Exception Alert

**Admiral Roadmap detected a recurring exception that needs attention.**

| Field | Value |
|-------|-------|
| Type | \`${exception_type}\` |
| Message | \`${msg}\` |
| Severity | \`${severity}\` |
| Occurrences | ${occurrences} in last ${LOOKBACK_HOURS}h |
| First seen | ${first_seen} |
| Last seen | ${last_seen} |
| Fingerprint | \`${fingerprint}\` |

### View in PostHog
[Open error tracking dashboard](https://us.posthog.com/error_tracking?fingerprint=${encodeURIComponent(fingerprint)})

### Next steps
- [ ] Reproduce and root cause the error
- [ ] Fix or suppress if false positive
- [ ] Mark resolved in PostHog once fixed

---
*Auto-raised by Admiral Roadmap via PostHog error scanner. Do not edit the fingerprint — it is used for deduplication.*
<!-- posthog-fingerprint: ${fingerprint} -->`;
}

function buildWrongLevelBody(ex) {
  const { fingerprint, exception_message, severity, occurrences } = ex;
  const msg = String(exception_message || '').substring(0, 200);
  return `## 📊 Wrong Log Level Detected

PostHog is receiving this as an **exception event**, but the message content suggests it is actually informational or a success message.

| Field | Value |
|-------|-------|
| Message | \`${msg}\` |
| Current level | \`${severity}\` |
| Occurrences | ${occurrences} in last ${LOOKBACK_HOURS}h |
| Fingerprint | \`${fingerprint}\` |

### What to do
Change the log call from \`logWarn()\`/\`console.error()\` to \`logInfo()\` or \`console.log()\` so it does not get captured as an exception by PostHog's SDK.

See [Issue #655](https://github.com/Focus-Bear/BearlyMail/issues/655) for a prior example of this pattern.

---
*Auto-raised by Admiral Roadmap via PostHog error scanner.*
<!-- posthog-fingerprint: ${fingerprint} -->`;
}

function issueAlreadyExists(repo, fingerprint) {
  try {
    const result = spawnSync(
      'gh', [
        'issue', 'list',
        '--repo', repo,
        '--search', `posthog-fingerprint: ${fingerprint}`,
        '--state', 'all',
        '--json', 'number,state',
        '--limit', '1',
      ],
      { env: { ...process.env }, encoding: 'utf8' }
    );
    if (result.status !== 0) return null;
    const parsed = JSON.parse(result.stdout.trim() || '[]');
    return parsed.length > 0 ? parsed[0] : null;
  } catch (_) {
    return null;
  }
}

function createGitHubIssue(repo, title, body, labels) {
  if (DRY_RUN) {
    log(`[dry-run] Would create issue in ${repo}:`);
    log(`  Title: ${title}`);
    log(`  Labels: ${labels.join(', ')}`);
    return 'https://github.com/' + repo + '/issues/DRY_RUN';
  }

  // Use spawnSync with array args to prevent shell injection via title/labels.
  // PostHog exception messages could contain backticks or $() sequences that
  // would be executed if interpolated into a shell string.
  const tmpFile = `/tmp/posthog-issue-body-${Date.now()}-${process.pid}.md`;
  fs.writeFileSync(tmpFile, body);

  try {
    const args = [
      'issue', 'create',
      '--repo', repo,
      '--title', title,
      '--body-file', tmpFile,
      ...labels.flatMap(l => ['--label', l]),
    ];
    const result = spawnSync('gh', args, {
      env: { ...process.env },
      encoding: 'utf8',
    });
    if (result.status !== 0) throw new Error(result.stderr || result.stdout);
    return result.stdout.trim();
  } finally {
    try { fs.unlinkSync(tmpFile); } catch (_) {}
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (DRY_RUN) {
    log('=== DRY RUN MODE — no issues will be created, no state will be saved ===');
  }

  log('Loading state file...');
  const state = loadState();

  let exceptions;
  try {
    exceptions = await fetchExceptions();
  } catch (err) {
    console.error(`ERROR: Failed to fetch from PostHog: ${err.message}`);
    process.exit(1);
  }

  log(`Fetched ${exceptions.length} exception groups from PostHog.`);

  const counts = {
    URGENT: 0,
    WRONG_LOG_LEVEL: 0,
    FALSE_POSITIVE: 0,
    NEEDS_REVIEW: 0,
    SKIP: 0,
    ERROR: 0,
  };

  for (const ex of exceptions) {
    const { fingerprint, exception_type, exception_message, occurrences } = ex;
    const shortMsg = String(exception_message || '').substring(0, 80);

    const { classification, reason, reRaise, existingIssueUrl } = classify(ex, state);

    log(`[${classification}] ${exception_type}: ${shortMsg} (×${occurrences}) — ${reason}`);
    counts[classification] = (counts[classification] || 0) + 1;

    if (classification === CLASSIFICATIONS.FALSE_POSITIVE) {
      if (!state.falsePositives.includes(fingerprint)) {
        state.falsePositives.push(fingerprint);
      }
      continue;
    }

    if (classification === 'SKIP' || classification === CLASSIFICATIONS.NEEDS_REVIEW) {
      continue;
    }

    // URGENT or WRONG_LOG_LEVEL — create GitHub issue
    const repo = routeRepo(ex);

    // Dedup via GitHub search (fallback)
    const existingIssue = issueAlreadyExists(repo, fingerprint);
    if (existingIssue && existingIssue.state === 'OPEN' && !reRaise) {
      log(`  Skipping — open GitHub issue #${existingIssue.number} already exists for this fingerprint.`);
      counts['SKIP']++;
      counts[classification]--;
      continue;
    }

    let title, body, labels;

    if (classification === CLASSIFICATIONS.URGENT) {
      const msgSnip = String(exception_message || '').substring(0, 80);
      title = `[PostHog] 🔴 ${exception_type}: ${msgSnip} (×${occurrences} in ${LOOKBACK_HOURS}h)`;
      body = buildUrgentBody(ex);
      if (reRaise && existingIssueUrl) {
        body += `\n\n---\n**Re-raised:** Previous issue was ${existingIssueUrl} (closed). Occurrences spiked to ${occurrences}.`;
      }
      labels = ['bug', 'openclaw', 'posthog-auto'];
    } else {
      // WRONG_LOG_LEVEL
      const msgSnip = String(exception_message || '').substring(0, 60);
      title = `[PostHog] ⚠️ Wrong log level: "${msgSnip}" should not be an exception`;
      body = buildWrongLevelBody(ex);
      labels = ['bug', 'openclaw', 'posthog-auto', 'log-level'];
    }

    try {
      const issueUrl = createGitHubIssue(repo, title, body, labels);
      log(`  ✅ Created issue: ${issueUrl}`);

      if (!DRY_RUN) {
        state.raisedIssues[fingerprint] = {
          githubIssueUrl: issueUrl,
          raisedAt: new Date().toISOString(),
          classification,
          occurrencesAtRaise: occurrences,
        };
      }
    } catch (err) {
      log(`  ❌ Failed to create issue: ${err.message}`);
      counts['ERROR']++;
      counts[classification]--;
    }
  }

  // Update lastRunAt
  if (!DRY_RUN) {
    state.lastRunAt = new Date().toISOString();
    saveState(state);
    log(`State file updated: ${STATE_FILE}`);
  }

  // Summary
  console.log('\n=== PostHog Error Scanner — Run Complete ===');
  console.log(`🔴 URGENT:           ${counts.URGENT} issues ${DRY_RUN ? 'would be ' : ''}raised`);
  console.log(`⚠️  WRONG_LOG_LEVEL:  ${counts.WRONG_LOG_LEVEL} issues ${DRY_RUN ? 'would be ' : ''}raised`);
  console.log(`🟢 FALSE_POSITIVE:   ${counts.FALSE_POSITIVE} skipped`);
  console.log(`⏭️  NEEDS_REVIEW:     ${counts.NEEDS_REVIEW} logged only`);
  console.log(`⏩ SKIP:             ${counts.SKIP} already tracked`);
  if (counts.ERROR > 0) {
    console.log(`❌ ERRORS:           ${counts.ERROR} issue creation failures`);
  }
  console.log(`✅ Total scanned:    ${exceptions.length} exception groups`);
  console.log(`Last run at:         ${new Date().toISOString()}`);
  if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN — no issues created, no state saved.');
  }
}

main().catch((err) => {
  console.error(`FATAL: ${err.message}`);
  process.exit(1);
});
