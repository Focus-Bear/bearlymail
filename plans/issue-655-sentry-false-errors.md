# Plan: Fix Sentry False-Positive Errors (Issue #655)

## Problem Summary

Sentry (via PostHog error tracking) is receiving false-positive error events for routine success messages. Two specific messages appear as errors in the dashboard:

- `✅ Loaded prompt: <key> from <file>`
- `✅ Prompts directory found at: <path>`

These are **success** messages emitted during normal server startup, but they show up as errors in Sentry/PostHog.

---

## Root Cause Analysis

### Finding 1: `logWarn` used for success messages in `server/src/llm/prompts.ts`

**File:** `server/src/llm/prompts.ts` — lines 68 and 143

```ts
// Line 68 — success message logged as WARNING
logWarn(`✅ Loaded prompt: ${key} from ${file}`);

// Line 143 — success message logged as WARNING
logWarn(`✅ Prompts directory found at: ${promptsDir}`);
```

**Why this causes Sentry noise:**

`logWarn` is defined in `server/src/utils/logger.ts`. In production (`NODE_ENV === "production"`), it:

1. Calls `console.warn(message)`
2. Creates a **synthetic `new Error(message)`** and calls `captureGlobalError()` with `severity: "warning"`
3. `captureGlobalError()` calls `posthogClient.captureException(error, ...)` — PostHog's `captureException` sends the event to Sentry as an **exception event**, which Sentry treats as an error

So two benign startup success strings get promoted to Sentry exceptions in production.

### Finding 2: `console.error()` used for non-error events in `server/src/error-tracking/error-tracking-setup.ts`

**File:** `server/src/error-tracking/error-tracking-setup.ts`

```ts
// Line ~28 — initialization success logged as console.error
console.error(
  `POSTHOG: Global tracking initialized (host: ${apiHost}, key prefix: ...)`,
);

// Line ~62 — "PostHog not initialized" logged as console.error
console.error(
  `POSTHOG: captureGlobalError called but client not initialized - error was: ${error.name}: ${error.message}`,
);
```

Sentry's SDK and log-drain integrations often capture `console.error` output as breadcrumbs or error events. Using `console.error` for informational messages creates noise.

### Finding 3: `logWarn` in `captureGlobalError` path (when PostHog uninitialized)

When PostHog client isn't initialized, `captureGlobalError` calls `console.error()`. If any caller passes a synthetic error for a warning, it doubles the noise.

---

## Affected Files

| File                                                | Line(s)  | Issue                                                             |
| --------------------------------------------------- | -------- | ----------------------------------------------------------------- |
| `server/src/llm/prompts.ts`                         | 68, 143  | `logWarn` used for success — promotes to Sentry exception in prod |
| `server/src/error-tracking/error-tracking-setup.ts` | ~28, ~62 | `console.error` used for info/debug messages                      |

---

## Proposed Fix

### Change 1: Replace `logWarn` with `logLog` (or `logger.log`) for success messages in `prompts.ts`

The `✅` prefix makes it clear these are success/informational logs. They should use an info-level logger, not warn.

**Option A — use `logLog` (if it exists) or `logger.log`:**

```ts
// Before:
logWarn(`✅ Loaded prompt: ${key} from ${file}`);
logWarn(`✅ Prompts directory found at: ${promptsDir}`);

// After:
logger.log(`✅ Loaded prompt: ${key} from ${file}`);
logger.log(`✅ Prompts directory found at: ${promptsDir}`);
```

Where `logger` is a NestJS `Logger` instance scoped to `"Prompts"`.

> ℹ️ The `logger.log()` / NestJS `Logger#log()` method does **not** go through `captureGlobalError` — it only writes to console as info. This stops the Sentry noise immediately.

**Option B — if a module-level logger already exists:**

Check whether `prompts.ts` already imports a logger. If not, add:

```ts
import { Logger } from "@nestjs/common";
const logger = new Logger("Prompts");
```

Then replace the two `logWarn` calls with `logger.log(...)`.

### Change 2: Replace `console.error` with `console.log` / `logger.log` for informational messages in `error-tracking-setup.ts`

```ts
// Before (line ~28):
console.error(`POSTHOG: Global tracking initialized ...`);

// After:
console.log(`POSTHOG: Global tracking initialized ...`);

// Before (line ~62):
console.error(
  `POSTHOG: captureGlobalError called but client not initialized ...`,
);

// After:
console.debug(
  `POSTHOG: captureGlobalError called but client not initialized ...`,
);
```

### Change 3 (Optional — longer term): Audit all `logWarn` call sites

Run:

```bash
grep -rn "logWarn" server/src --include="*.ts" | grep "✅\|success\|found\|initialized\|loaded"
```

Any `logWarn` call with a success/positive message should be moved to `logger.log` or `console.log`.

---

## Testing / Verification

1. Start the server locally in `NODE_ENV=production` mode (or with a mock PostHog key).
2. Check that server startup logs do NOT emit `captureException` calls for the prompt messages.
3. Confirm PostHog/Sentry dashboard shows no new false-positive events after the change.
4. Unit test: add a test to `llm.service.spec.ts` or a new `prompts.spec.ts` that spies on `captureGlobalError` and asserts it is **not** called during `loadPrompts()`.

---

## Risk Assessment

| Risk                                  | Level | Notes                                                |
| ------------------------------------- | ----- | ---------------------------------------------------- |
| Breaking real error reporting         | Low   | Changes only affect success-message log levels       |
| Missing a genuine warning             | Low   | Both messages with `✅` are unambiguously successful |
| Side-effects in non-prod environments | None  | `logWarn` in non-prod only calls `console.warn`      |

---

## Implementation Steps

1. **Branch:** `fix/issue-655-sentry-false-errors` ✅ (this branch)
2. Edit `server/src/llm/prompts.ts` — replace `logWarn` with `logger.log` for the two `✅` messages
3. Edit `server/src/error-tracking/error-tracking-setup.ts` — replace `console.error` with `console.log`/`console.debug` for non-error messages
4. Run `grep -rn "logWarn" server/src --include="*.ts" | grep "✅"` to confirm no remaining false-positives
5. Open PR, request review

---

🧘 This PR was created by Monk of Modularity (AI Agent).
