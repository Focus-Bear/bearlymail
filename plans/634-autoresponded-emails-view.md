# Plan: Add "View Autoresponded Emails" View

**Issue:** #634 — Add view autoresponded emails view
**Summary:** Add an "Autoresponded emails" option alongside the existing "View blocked emails" menu item, showing email threads where an auto-response was sent.

---

## Context

- The inbox already has a `blocked` mode that shows blocked emails (`InboxMode = 'triage' | 'action' | 'follow-up' | 'blocked'`)
- Auto-responses are logged in the `auto_response_logs` table with `emailThreadId`, `userId`, `sentAt`, response details, and classification data
- The auto-responder controller (`/auto-responder/*`) has analytics and config endpoints but no endpoint to list individual auto-responded threads
- The "View blocked emails" button is in `InboxHeaderActions.tsx` and sets the inbox mode

## Changes Required

### 1. Backend — New API Endpoint

**File:** `server/src/auto-responder/auto-responder.controller.ts`

Add a `GET /auto-responder/threads` endpoint that:
- Accepts `userId` from auth, optional `page`, `limit`, `startDate`, `endDate` query params
- Joins `auto_response_logs` with `email_threads` to return threaded email data
- Returns paginated list of threads with auto-response metadata (sent date, template used, priority, QA answer status)
- Orders by `sentAt` descending (most recent first)

**File:** `server/src/auto-responder/auto-responder-analytics.service.ts`

Add a `getAutoRespondedThreads(userId, options)` method that:
- Queries `auto_response_logs` joined with `email_threads`
- Supports pagination and date filtering
- Returns thread data enriched with auto-response info (response body, classification, escalation status)

### 2. Frontend — New Inbox Mode

**File:** `client/src/types/email.ts`

- Add `'autoresponded'` to the `InboxMode` union type:
  ```ts
  export type InboxMode = 'triage' | 'action' | 'follow-up' | 'blocked' | 'autoresponded';
  ```

**File:** `client/src/constants/strings.ts`

- Add `MODE_AUTORESPONDED = 'autoresponded'` constant
- Update `InboxModeType` union

### 3. Frontend — Menu Item

**File:** `client/src/components/inbox/header/InboxHeaderActions.tsx`

- Add "View autoresponded emails" button alongside the "View blocked emails" button
- Wire it to `onViewAutorespondedEmails` callback that sets mode to `'autoresponded'`

**File:** `client/src/pages/Inbox.tsx`

- Add `onViewAutorespondedEmails={() => setMode('autoresponded')}` prop
- Handle `'autoresponded'` mode in the email list rendering

### 4. Frontend — Data Fetching

**File:** `client/src/hooks/` (new hook or extend existing)

- Create `useAutorespondedEmails.ts` hook (or extend existing email fetching)
- Call `GET /auto-responder/threads` when mode is `'autoresponded'`
- Return thread list with auto-response metadata

### 5. Frontend — Email List Display

When in `'autoresponded'` mode, the email list should:
- Show the email thread subject and sender
- Display a badge/indicator showing the auto-response was sent
- Show the date the auto-response was sent
- Optionally show the template type used (standard, high priority, etc.)
- Allow clicking into the thread to see the full conversation including the auto-response

### 6. Frontend — Empty State & Loading

**File:** `client/src/components/inbox/states/EmptyState.tsx`

- Add empty state message for `'autoresponded'` mode: "No auto-responded emails yet"

**File:** `client/src/components/inbox/states/LoadingState.tsx`

- Ensure loading state handles the new mode

### 7. Frontend — Sidebar & Help

**File:** `client/src/components/inbox/header/HelpLink.tsx`

- Add help link mapping for `'autoresponded'` mode

### 8. i18n

- Add translation keys for all new UI strings:
  - `inbox.viewAutorespondedEmails`
  - `inbox.emptyAutoresponded`
  - Related labels and tooltips

## Testing

- **Unit tests:** New analytics service method, controller endpoint
- **Integration tests:** API endpoint returns correct threads for user
- **Frontend:** Component renders in autoresponded mode, empty state works, pagination works
- **E2E:** Click "View autoresponded emails" → see list → click thread → see detail

## Out of Scope

- Modifying auto-response behavior or templates (existing settings page handles this)
- Auto-response log editing or deletion
- Export of auto-responded email data (could be a follow-up)
