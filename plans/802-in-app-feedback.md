# Plan: #802 — Add ability to leave feedback within BearlyMail

> **Created by:** Monk of Modularity (AI planning agent)
> **Issue:** https://github.com/Focus-Bear/BearlyMail/issues/802

---

## Problem Analysis

There is no in-app feedback mechanism. Users who encounter issues or want to suggest improvements have no easy way to do so from within BearlyMail. The Help page exists (`/help`) but doesn't have a contact/feedback form.

Requirements:

- Help button → contact form
- Screenshot upload support (saved to S3)
- Feedback message + user email (encrypted) stored in DB
- Admin section to view submitted feedback

---

## Root Cause Hypothesis

This is a new feature, not a bug. No feedback infrastructure exists yet.

---

## Implementation Steps

### Step 1: Database — Feedback entity and migration

**File:** `server/src/database/entities/feedback.entity.ts` (new)

```
- id: UUID (PK)
- userEmailEncrypted: string (encrypted user email)
- message: string (text)
- screenshotS3Key: string | null
- createdAt: Date
- appVersion: string | null
- userAgent: string | null
```

**File:** `server/src/database/migrations/<timestamp>-CreateFeedbackTable.ts` (new)

- Standard TypeORM migration to create the `feedback` table.

### Step 2: Backend — S3 upload endpoint

**File:** `server/src/feedback/feedback.controller.ts` (new)

- `POST /feedback/screenshot` — accepts multipart image upload, uploads to S3 with key `feedback/<uuid>-<timestamp>.<ext>`, returns the S3 key.
- Use existing S3 service if available, or `@aws-sdk/client-s3`.
- Auth: requires user to be logged in (or rate-limit heavily if unauthenticated).

**File:** `server/src/feedback/feedback.service.ts` (new)

- `uploadScreenshot(file, userId)` → S3 upload, returns key.
- `createFeedback({ userId, message, screenshotKey })` → encrypts user email, saves to DB.
- `listFeedback()` → admin-only, returns decrypted feedback list.

**File:** `server/src/feedback/feedback.module.ts` (new)

- Register controller, service, and entity.

### Step 3: Email encryption

**File:** `server/src/feedback/feedback.service.ts`

- Use Node.js `crypto` (AES-256-GCM) to encrypt user email before storing.
- Store encryption key in environment variable (`FEEDBACK_ENCRYPTION_KEY`).
- On retrieval (admin view), decrypt on the fly.
- Alternative: use bcrypt hash if admin only needs to see obfuscated emails (no need to decrypt). Decision TBD with team.

### Step 4: Frontend — Feedback form

**File:** `client/src/components/feedback/FeedbackModal.tsx` (new)

- Modal with:
  - Text area: "What happened? What did you expect?"
  - Optional screenshot upload (accepts image files, previews thumbnail)
  - Submit button
  - Success/error state
- On submit:
  1. If screenshot selected: `POST /feedback/screenshot` (multipart) → get S3 key.
  2. `POST /feedback` with `{ message, screenshotKey }`.

**File:** `client/src/components/feedback/FeedbackButton.tsx` (new)

- Small "?" or "Feedback" button (floating or in nav/Help page) that opens `FeedbackModal`.

### Step 5: Frontend — Wire into Help page / nav

**File:** `client/src/pages/Help.tsx`

- Add a "Contact us / Send feedback" section that opens `FeedbackModal`.
- Or: add a persistent floating feedback button (bottom-right corner).

**File:** `client/src/components/layout/Sidebar.tsx` (or wherever the Help button is)

- Ensure the Help button routes to `/help` which prominently shows the feedback option.

### Step 6: Admin section

**File:** `client/src/pages/admin/FeedbackAdmin.tsx` (new)

- Table of submissions: timestamp, message, screenshot link, user email (decrypted).
- Protected route — only accessible to admin role.
- Screenshots: render as links or thumbnails pointing to the S3 presigned URLs.

**File:** `server/src/feedback/feedback.controller.ts`

- `GET /admin/feedback` — admin guard, returns paginated feedback with decrypted emails and presigned S3 URLs.

---

## Files to Modify / Create

| File                                                         | Change                                                              |
| ------------------------------------------------------------ | ------------------------------------------------------------------- |
| `server/src/database/entities/feedback.entity.ts`            | New entity                                                          |
| `server/src/database/migrations/<ts>-CreateFeedbackTable.ts` | New migration                                                       |
| `server/src/feedback/feedback.controller.ts`                 | New: POST /feedback, POST /feedback/screenshot, GET /admin/feedback |
| `server/src/feedback/feedback.service.ts`                    | New: upload, create, list, encrypt/decrypt                          |
| `server/src/feedback/feedback.module.ts`                     | New module                                                          |
| `server/src/app.module.ts`                                   | Register FeedbackModule                                             |
| `client/src/components/feedback/FeedbackModal.tsx`           | New modal component                                                 |
| `client/src/components/feedback/FeedbackButton.tsx`          | New trigger button                                                  |
| `client/src/pages/Help.tsx`                                  | Wire in feedback button                                             |
| `client/src/pages/admin/FeedbackAdmin.tsx`                   | New admin view                                                      |

---

## Testing Approach

1. **Unit tests:**
   - `FeedbackService.createFeedback`: verify email is encrypted before saving.
   - `FeedbackService.uploadScreenshot`: mock S3 client, verify correct bucket/key.
   - `FeedbackController` guards: unauthenticated POST should fail; non-admin GET /admin/feedback should fail.

2. **E2E / integration:**
   - Submit feedback with screenshot → verify row in DB (encrypted email), screenshot in S3.
   - Admin view → decrypted email + screenshot link visible.

3. **Manual:**
   - On mobile and desktop: open feedback modal, upload screenshot, submit.
   - Verify the modal is accessible and keyboard-navigable.

---

## Notes

- S3 bucket for feedback screenshots should be separate from or a prefix within the existing screenshots bucket.
- Screenshots should have a retention policy (e.g., 90 days) to manage storage costs.
- File size limit: 10MB max for screenshots.
- Consider rate limiting the feedback endpoint (e.g., 5 submissions per user per day).
- GDPR: encrypted email + ability for user to request deletion should be noted in privacy policy.
