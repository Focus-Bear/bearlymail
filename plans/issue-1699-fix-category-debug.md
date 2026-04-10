# Plan: Fix Category Debug Not Working (#1699)

## Problem

The category debug feature is broken. Users report it is not functioning when triggered from the inbox priority tooltip.

## Root Cause Analysis

Investigation reveals **two compounding issues**:

### 1. Duplicate Route Registration (server)

Both `EmailDebugController` and `EmailDebugAdminController` register `@Get(":id/debug/category")` on the same `@Controller("emails")` prefix:

- **`EmailDebugAdminController`** — registered first in `emails.module.ts` controllers array (index 0)
- **`EmailDebugController`** — registered later (index 3)

In NestJS, when two controllers on the same prefix register the same route pattern, the first one wins. This means:

- The `EmailDebugAdminController` version handles all `GET /emails/:id/debug/category` requests
- The `EmailDebugController` version is dead code for this route

Additionally, `EmailDebugController` has many routes that **duplicate** `EmailDebugAdminController` routes:
- `debug/sync-status`, `debug/sync-history`, `debug/starred-threads`, `debug/orphan-emails`
- `debug/fix-orphan-emails`, `debug/reset-stuck-jobs`, `debug/fix-stuck-calculating`
- `debug/fix-stale-unsynced`, `debug/thread-lookup/:threadId`
- `admin/job-stats`
- **`:id/debug/category`** (the problematic duplicate)

The only routes **unique** to `EmailDebugController` are:
- `debug/priority-info`
- `:id/debug/refresh-attachments-from-gmail`

### 2. Error Handling Gap (server)

In `EmailDebugCategoryService.getCategoryDebugData()`, when an email is not found:

```typescript
if (!email) {
  throw new Error(`Email ${emailId} not found for user ${userId}`);
}
```

This throws a raw `Error`, not a NestJS `NotFoundException`. NestJS converts unrecognised errors into a generic **500 Internal Server Error**, which:
- Returns an unhelpful error response to the client
- May cause the `CategoryDebugModal` to show a generic "fetch error" message
- Logs a confusing stack trace on the server

### 3. Guard Inconsistency

`EmailDebugController` applies `AdminGuard` at the **class level**, while `EmailDebugAdminController` applies it **per-method** with varying guard combinations. The `getCategoryDebugData` route in `EmailDebugAdminController` uses `@UseGuards(JwtAuthGuard, AdminGuard)` — it has class-level `GmailRequiredGuard` but method-level adds `AdminGuard`. This asymmetry is confusing but functionally equivalent for the category debug endpoint.

## Implementation Steps

### Step 1: Remove Duplicate Routes from `EmailDebugController`

**File:** `server/src/emails/email-debug.controller.ts`

Remove all routes that are already handled by `EmailDebugAdminController`:
- `getSyncStatus`, `getSyncHistory`, `debugStarredThreads`, `debugOrphanEmails`
- `fixOrphanEmails`, `resetStuckJobs`, `fixStuckCalculating`, `fixStaleUnsynced`
- `lookupThread`, `getCategoryDebugData`, `getJobStats`

Keep only the routes unique to this controller:
- `debug/priority-info`
- `:id/debug/refresh-attachments-from-gmail`

Remove now-unused constructor dependencies (`EmailsService`, `EmailAdminService`, `PgBoss`) if they are no longer needed by the remaining routes.

### Step 2: Add Missing Routes to `EmailDebugAdminController`

**File:** `server/src/emails/email-debug-admin.controller.ts`

Ensure `EmailDebugAdminController` has all necessary routes. Currently missing:
- `@Get("debug/priority-info")` — move from `EmailDebugController`
- `@Post(":id/debug/refresh-attachments-from-gmail")` — move from `EmailDebugController`

Add the `GmailSyncService` dependency to the constructor for the attachments endpoint.

### Step 3: Fix Error Handling in `EmailDebugCategoryService`

**File:** `server/src/emails/email-debug-category.service.ts`

Replace the raw `Error` throw with a NestJS `NotFoundException`:

```typescript
import { NotFoundException } from "@nestjs/common";

// In getCategoryDebugData():
if (!email) {
  throw new NotFoundException(`Email ${emailId} not found`);
}
```

This returns a clean 404 to the client instead of a 500.

### Step 4: Update Tests

**File:** `server/src/emails/email-debug.controller.spec.ts`

Update tests to reflect the reduced set of routes in `EmailDebugController`. Remove test cases for routes that were moved to `EmailDebugAdminController`. Add test cases for the moved routes in the admin controller's test file (or create one if it doesn't exist).

### Step 5: Verify Client Handles 404 Gracefully

**File:** `client/src/components/priority/CategoryDebugModal.tsx`

Verify that the error handling in the `load` callback gracefully handles a 404 response. The current catch block shows a generic error message, which is acceptable — but consider differentiating between "email not found" (404) and "server error" (500) for a better UX.

## Files Changed

| File | Change |
|------|--------|
| `server/src/emails/email-debug.controller.ts` | Remove duplicate routes, keep only unique ones |
| `server/src/emails/email-debug-admin.controller.ts` | Add `debug/priority-info` and `refresh-attachments-from-gmail` routes |
| `server/src/emails/email-debug-category.service.ts` | Use `NotFoundException` instead of raw `Error` |
| `server/src/emails/email-debug.controller.spec.ts` | Update tests for reduced controller |
| `server/src/emails/emails.module.ts` | Possibly update controller registration order if needed |

## Testing

1. Verify `GET /emails/:id/debug/category` returns correct data for a valid email ID
2. Verify `GET /emails/:id/debug/category` returns 404 for invalid email ID (not 500)
3. Verify `POST /emails/:id/debug/refresh-attachments-from-gmail` still works after route migration
4. Verify `GET /emails/debug/priority-info` still works after route migration
5. Verify the CategoryDebugModal opens and displays data correctly in the inbox UI
6. Run existing tests: `npm test -- --testPathPattern=email-debug`
