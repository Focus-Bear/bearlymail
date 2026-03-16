# Plan: #802 — Add ability to leave feedback within BearlyMail

> **Created by:** Monk of Modularity (AI planning agent)
> **Issue:** https://github.com/Focus-Bear/BearlyMail/issues/802
> **Revised:** 2026-03-16 — addressed Refactor Raccoon review (PR #1050)

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

## Design Decisions (resolved from review)

### 1. Encryption approach: AES-256-GCM ✅

User email is encrypted with **AES-256-GCM** before storing in the DB.

- Admin can view the actual user email (decrypted on read) — this is the intended UX.
- Encryption key stored in `FEEDBACK_ENCRYPTION_KEY` environment variable (32-byte hex string).
- This env var **must be added to all environments**: dev (`.env`), staging, and prod.
- DB column type: `varchar` (stores base64-encoded `iv:authTag:ciphertext`).
- Encryption/decryption lives in `feedback.service.ts` only — no raw emails are ever persisted.

### 2. Screenshot upload: authenticated users only, server-side MIME validation ✅

- **Auth required**: Only authenticated users can upload screenshots or submit feedback. Anonymous/unauthenticated uploads are not supported. This is the safest default and aligns with the existing product model (BearlyMail requires login).
- **Accepted MIME types**: `image/jpeg`, `image/png`, `image/webp` only.
- **Server-side MIME validation**: Use the [`file-type`](https://github.com/sindresorhus/file-type) npm package to detect MIME type from the file's magic bytes — not from the file extension or the `Content-Type` header sent by the client.
- **Filename sanitisation**: S3 key is generated server-side as `feedback/<userId>/<uuid>-<timestamp>.<safeExt>` where `<safeExt>` is derived from the validated MIME type, never from the user-supplied filename.
- **Size limit**: 10MB max (enforced by Multer `limits.fileSize`).

### 3. S3 presigned URL TTL: 1 hour ✅

- Admin view generates presigned S3 URLs with **1-hour expiry**.
- URLs are generated on-demand per request — not stored in the DB.

### 4. Retention policy: S3 lifecycle rule ✅

- Configure an **S3 lifecycle rule** on the `feedback/` prefix to expire objects after **90 days**.
- This is infrastructure configuration (IaC / manual AWS console step), not application code.
- Document the required lifecycle rule in `docs/feedback-s3-lifecycle.md` so it can be applied during deployment.
- The DB record is retained independently; only the S3 object expires. After S3 expiry, the screenshot link in the admin view will return 404 (acceptable — the text feedback is still visible).

---

## Implementation Steps

### Step 1: Database — Feedback entity and migration

**File:** `server/src/database/entities/feedback.entity.ts` (new)
```
- id: UUID (PK)
- userEmailEncrypted: varchar  ← base64-encoded AES-256-GCM ciphertext (iv:authTag:ciphertext)
- message: text
- screenshotS3Key: varchar | null
- createdAt: Date (auto)
- appVersion: varchar | null
- userAgent: varchar | null
```

**File:** `server/src/database/migrations/<timestamp>-CreateFeedbackTable.ts` (new)
- Standard TypeORM migration to create the `feedback` table with columns above.

### Step 2: Backend — Feedback module

**File:** `server/src/feedback/feedback.controller.ts` (new)

Endpoints:
- `POST /feedback/screenshot`
  - Guard: `JwtAuthGuard` (authenticated users only — no unauthenticated path).
  - Accepts: `multipart/form-data`, field name `file`.
  - Multer config: `limits: { fileSize: 10 * 1024 * 1024 }` (10MB).
  - Server-side validation: use `file-type` to read magic bytes; reject if detected MIME is not `image/jpeg`, `image/png`, or `image/webp` (return HTTP 422).
  - S3 key: `feedback/<userId>/<uuid>-<Date.now()>.<ext>` where `<ext>` is from validated MIME (`jpeg`/`png`/`webp`), **not** from the original filename.
  - Returns: `{ key: string }`.

- `POST /feedback`
  - Guard: `JwtAuthGuard`.
  - Body: `{ message: string, screenshotKey?: string }`.
  - Service encrypts user email (from JWT payload) and persists to DB.
  - Returns: `{ id: string }`.

- `GET /admin/feedback`
  - Guard: `JwtAuthGuard` + `AdminGuard` (or `RolesGuard` with admin role — use whatever guard pattern exists in the repo).
  - Query params: `page` (default 1), `limit` (default 20, max 100).
  - Returns paginated list; service decrypts emails and generates 1-hour presigned S3 URLs for screenshot keys.
  - Returns: `{ data: FeedbackItem[], total: number, page: number }`.

**File:** `server/src/feedback/feedback.service.ts` (new)

Key methods:
- `encryptEmail(email: string): string` — AES-256-GCM encrypt, returns `<ivHex>:<authTagHex>:<ciphertextBase64>`.
- `decryptEmail(encrypted: string): string` — reverse.
- `uploadScreenshot(buffer: Buffer, mimeType: string, userId: string): Promise<string>` — uploads to S3, returns key.
- `createFeedback(userId: string, email: string, dto: CreateFeedbackDto): Promise<Feedback>` — encrypts email, saves entity.
- `listFeedback(page: number, limit: number): Promise<{ data: FeedbackAdminItem[], total: number }>` — decrypts emails, generates presigned URLs (TTL: 3600s).

**File:** `server/src/feedback/feedback.module.ts` (new)
- Register `FeedbackController`, `FeedbackService`, `TypeOrmModule.forFeature([Feedback])`.
- Import S3 module (or inject S3 client directly, consistent with existing pattern in repo).

**File:** `server/src/app.module.ts` (modify)
- Add `FeedbackModule` to `imports`.

### Step 3: Environment variable

Add to `.env.example` and deployment configs:
```
FEEDBACK_ENCRYPTION_KEY=<32-byte hex string>   # Required for feedback email encryption
```

Document: generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
This must be set in **dev**, **staging**, and **prod** before deploying.

### Step 4: Frontend — Feedback form

**File:** `client/src/components/feedback/FeedbackModal.tsx` (new)
- Modal with:
  - Text area: "What happened? What did you expect?"
  - Optional screenshot upload — `<input type="file" accept="image/jpeg,image/png,image/webp" />` (client-side filter for UX only; server validates).
  - Preview thumbnail on selection.
  - Submit button with loading/success/error states.
- On submit:
  1. If screenshot selected: `POST /feedback/screenshot` (multipart) → get S3 key.
  2. `POST /feedback` with `{ message, screenshotKey? }`.

**File:** `client/src/components/feedback/FeedbackButton.tsx` (new)
- Button (floating or in Help page) that opens `FeedbackModal`.

### Step 5: Frontend — Wire into Help page

**File:** `client/src/pages/Help.tsx` (modify)
- Add "Send Feedback" section that renders `<FeedbackButton />`.

### Step 6: Admin section

**File:** `client/src/pages/admin/FeedbackAdmin.tsx` (new)
- Table of submissions: timestamp, user email (decrypted), message, screenshot (link/thumbnail), user agent, app version.
- Pagination controls.
- Protected route — admin role only (consistent with other admin pages).
- Screenshot links open the presigned URL in a new tab.

### Step 7: S3 lifecycle rule documentation

**File:** `docs/feedback-s3-lifecycle.md` (new)
- Documents the required S3 lifecycle rule:
  - Prefix: `feedback/`
  - Expiration: 90 days
  - How to apply (AWS console or Terraform snippet)

---

## Files to Modify / Create

| File | Change |
|------|--------|
| `server/src/database/entities/feedback.entity.ts` | New entity |
| `server/src/database/migrations/<ts>-CreateFeedbackTable.ts` | New migration |
| `server/src/feedback/feedback.controller.ts` | New: POST /feedback, POST /feedback/screenshot, GET /admin/feedback |
| `server/src/feedback/feedback.service.ts` | New: upload, create, list, AES-256-GCM encrypt/decrypt |
| `server/src/feedback/feedback.module.ts` | New module |
| `server/src/app.module.ts` | Register FeedbackModule |
| `.env.example` | Add FEEDBACK_ENCRYPTION_KEY |
| `client/src/components/feedback/FeedbackModal.tsx` | New modal component |
| `client/src/components/feedback/FeedbackButton.tsx` | New trigger button |
| `client/src/pages/Help.tsx` | Wire in FeedbackButton |
| `client/src/pages/admin/FeedbackAdmin.tsx` | New admin view |
| `docs/feedback-s3-lifecycle.md` | S3 retention policy documentation |

---

## Testing Approach

1. **Unit tests:**
   - `FeedbackService.encryptEmail` / `decryptEmail`: round-trip test, verify ciphertext differs from plaintext.
   - `FeedbackService.createFeedback`: verify `userEmailEncrypted` stored is not the raw email.
   - `FeedbackService.uploadScreenshot`: mock S3 client, verify correct bucket/key format.
   - `FeedbackController` guards: unauthenticated POST → 401; non-admin `GET /admin/feedback` → 403.
   - Screenshot upload with invalid MIME (e.g., `application/pdf` disguised as `.png`) → 422.

2. **E2E / integration:**
   - Submit feedback with screenshot → verify row in DB (email encrypted), object in S3.
   - Admin view → decrypted email + presigned screenshot URL visible.
   - Presigned URL has ~1h TTL (check `X-Amz-Expires` param = 3600).

3. **Manual:**
   - Open feedback modal on mobile and desktop.
   - Upload screenshot, submit, verify success state.
   - Verify modal is accessible and keyboard-navigable.

---

## Notes

- S3 bucket: use the existing screenshots bucket with `feedback/` prefix, or a dedicated bucket — implementer should check what exists.
- Rate limiting: consider 5 submissions per user per day (can be added as a follow-up if not trivially expressible in the existing middleware stack).
- GDPR: encrypted email + ability for user to request deletion should be noted in the privacy policy update.
- The `file-type` package must be added as a dependency: `npm install file-type` in `server/`.
