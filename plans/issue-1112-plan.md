# Implementation Plan: Allow Adding Teammates to a BearlyMail Account (#1112)

> **Status:** Batch A merged ✅ — Batches B–E remain  
> **References:** Issue #1112, Plan PR #1243 (closed), Batch A PR #1250 (merged)  
> **Author:** Monk of Modularity (AI planning agent)

---

## 1. Current State Assessment

### What Batch A Delivered (PR #1250 — merged)

| Component                                                                                       | Status    |
| ----------------------------------------------------------------------------------------------- | --------- |
| `Organization` entity (`organizations` table)                                                   | ✅ Merged |
| `OrganizationMember` entity (`organization_members` table)                                      | ✅ Merged |
| `OrganizationsModule` (7 endpoints: create, get, invite, validate, accept, update role, remove) | ✅ Merged |
| `InviteService` (SES email dispatch with HTML template)                                         | ✅ Merged |
| 17 unit tests (happy + error paths)                                                             | ✅ Merged |
| DB migration `1786000000000-CreateOrganizationAndMember`                                        | ✅ Merged |

### What's Still Missing (Batches B–E)

| Batch | Scope                                                                 | Status         |
| ----- | --------------------------------------------------------------------- | -------------- |
| B     | Thread `assigneeId` column + assignment API                           | ❌ Not started |
| C     | Frontend: TeamSettings page, AcceptInvite page, inbox assignee filter | ❌ Not started |
| D     | TeamSubscription / RevenueCat seat-based billing                      | ❌ Not started |
| E     | E2E journey tests                                                     | ❌ Not started |

---

## 2. Codebase Investigation Findings

### 2.1 Account / User Model

- **Single-user model today:** `User` entity has no org FK. Each user owns their own email accounts (`GoogleAccount`, `Office365Account`, `ZohoAccount`), threads, contacts, etc.
- **Organization layer (Batch A):** `Organization` has `ownerId → User`. `OrganizationMember` links users to orgs with roles (`owner | admin | member`) and statuses (`pending | active | deactivated`).
- **Constraint:** One org per owner. One active membership per user. These constraints are enforced in `OrganizationsService`.

### 2.2 Auth / JWT Structure

- JWT auth via `JwtAuthGuard` — token payload includes `userId`.
- No org/role claims in the JWT today. The `OrganizationsService` does DB lookups for permission checks.
- Google / Microsoft / Zoho OAuth for email provider connections (separate from app auth).
- `Public()` decorator used for unauthenticated endpoints (e.g., invite validation).

### 2.3 Email Thread Model

- `EmailThread` is scoped to a single user via `userId` (with unique index on `[userId, threadId]`).
- No `assigneeId` column exists yet.
- Inbox queries in `EmailInboxService` filter by `userId` — all queries are user-scoped.
- The inbox supports modes: action, process, scheduled, snoozed, archived, focused, starred.
- Category filtering is done via `categoryId` FK on `EmailThread`.

### 2.4 Subscription / Billing

- RevenueCat integration exists in `SubscriptionsService` (webhooks, status sync).
- `User` entity has: `revenueCatUserId`, `subscriptionStatus`, `subscriptionExpiresAt`, `trialStartedAt`.
- No seat-based or team subscription concept yet — billing is per-individual.
- `SubscriptionGuard` enforces subscription checks on protected routes.

### 2.5 Frontend Architecture

- React SPA with React Router v6. Routes defined in `App.tsx`.
- Settings page has multiple sections (components in `client/src/components/settings/`).
- No team/org UI exists — no AcceptInvite page, no TeamSettings component.
- API calls use React Query (`client/src/queries/`).
- i18n via i18next with locale files in `client/src/locales/`.

---

## 3. Batch B: Thread Assignment API

### 3.1 Scope

Add `assigneeId` to `EmailThread` and create endpoints for assigning/unassigning threads to org members.

### 3.2 Data Model Changes

**Migration: `AddAssigneeIdToEmailThread`**

```
ALTER TABLE email_threads ADD COLUMN "assigneeId" uuid NULL;
ALTER TABLE email_threads ADD CONSTRAINT FK_email_threads_assignee
  FOREIGN KEY ("assigneeId") REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IDX_email_threads_assignee ON email_threads("userId", "assigneeId");
```

**Entity change:** Add to `EmailThread`:

```typescript
@Column({ type: "uuid", nullable: true, comment: "Assigned team member (null = unassigned)" })
assigneeId: string | null;

@ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
@JoinColumn({ name: "assigneeId" })
assignee: User | null;
```

### 3.3 New Endpoints

Add to `OrganizationsController` (or a new `ThreadAssignmentController`):

| Method | Path                              | Auth             | Description                     |
| ------ | --------------------------------- | ---------------- | ------------------------------- |
| PATCH  | `/email-threads/:threadId/assign` | JWT (org member) | Assign thread to a member       |
| DELETE | `/email-threads/:threadId/assign` | JWT (org member) | Unassign thread                 |
| GET    | `/email-threads/assigned/:userId` | JWT (org member) | List threads assigned to a user |

**Business rules:**

- Only active org members can assign/be assigned threads.
- A thread can only be assigned to a member of the same org as the thread owner.
- Assignee must be an active member with status `active`.
- Self-assignment is allowed (any member can assign to themselves).
- Admin/owner can assign to any member; regular members can only self-assign.

### 3.4 Inbox Filter Extension

Extend `EmailInboxService` query builder to support an optional `assigneeId` filter:

```typescript
if (filters.assigneeId) {
  qb.andWhere("thread.assigneeId = :assigneeId", {
    assigneeId: filters.assigneeId,
  });
}
if (filters.assigneeId === "unassigned") {
  qb.andWhere("thread.assigneeId IS NULL");
}
```

### 3.5 Files to Create/Modify

| File                                                                  | Action                                      |
| --------------------------------------------------------------------- | ------------------------------------------- |
| `server/src/database/migrations/XXXXXX-AddAssigneeIdToEmailThread.ts` | Create                                      |
| `server/src/database/entities/email-thread.entity.ts`                 | Modify (add `assigneeId`, `assignee`)       |
| `server/src/emails/email-inbox.service.ts`                            | Modify (add assignee filter)                |
| `server/src/emails/emails.controller.ts`                              | Modify (add assign/unassign endpoints)      |
| `server/src/emails/dto/assign-thread.dto.ts`                          | Create                                      |
| `server/src/organizations/organizations.service.ts`                   | Modify (add helper: `getOrgMembersForUser`) |
| Unit tests for assignment logic                                       | Create                                      |

### 3.6 Estimated PRs: 1–2

---

## 4. Batch C: Frontend — Team Settings, Accept Invite, Assignee Filter

### 4.1 AcceptInvite Page

**Route:** `/accept-invite/:token`

**Flow:**

1. Page loads → calls `GET /organizations/invite/:token` (public) to validate token.
2. If invalid/expired → show error message with option to request new invite.
3. If valid → show org name, inviter name, role. User clicks "Accept".
4. If not logged in → redirect to login/signup with `?redirect=/accept-invite/:token`.
5. If logged in → calls `POST /organizations/invite/:token/accept` → redirect to inbox.

**Files to create:**

- `client/src/pages/AcceptInvite.tsx`
- `client/src/queries/useValidateInvite.ts`
- `client/src/queries/useAcceptInvite.ts`

**Route addition in `App.tsx`:**

```tsx
<Route path="/accept-invite/:token" element={<AcceptInvite />} />
```

### 4.2 TeamSettings Page (Settings Section)

**Location:** New section in Settings page, or a dedicated `/settings/team` route.

**Components:**

- `client/src/components/settings/TeamSettingsSection.tsx` — main section
- Show org name (editable by owner).
- Member list with roles, status, invite date.
- "Invite Member" form (email + role select).
- Role edit dropdown (admin/owner only).
- Remove/deactivate button (admin/owner only).
- Pending invites with resend option.

**Files to create:**

- `client/src/components/settings/TeamSettingsSection.tsx`
- `client/src/queries/useMyOrganization.ts`
- `client/src/queries/useInviteMember.ts`
- `client/src/queries/useUpdateMemberRole.ts`
- `client/src/queries/useRemoveMember.ts`

**Conditional rendering:** Only show TeamSettings section if user is in an org (check via `GET /organizations/me`). If not in an org, show "Create Team" CTA.

### 4.3 Inbox Assignee Filter

**Location:** Inbox filter bar (alongside existing account/category/priority filters).

**Behaviour:**

- Only visible if user is in an org.
- Dropdown: "All", "Assigned to me", "Unassigned", [list of team members].
- Default: "All" (shows everything, same as current behaviour for non-org users).
- Filter is passed to the inbox query as `assigneeId` parameter.

**Files to modify:**

- Inbox filter component (add assignee dropdown)
- Inbox query hook (add assignee param)
- `client/src/queries/useInboxThreads.ts` (or equivalent)

### 4.4 Thread Assignment UI

**Location:** Thread detail view / email card.

**Behaviour:**

- "Assign" button/dropdown on thread detail.
- Shows current assignee avatar + name.
- Dropdown lists org members (fetched from `/organizations/me`).
- "Unassign" option.
- Only visible to org members.

### 4.5 i18n

All new UI strings must go through i18next. Add keys to:

- `client/src/locales/en/translation.json`
- Other locale files as needed.

### 4.6 Estimated PRs: 2–3

- PR C1: AcceptInvite page + routing
- PR C2: TeamSettings section in settings
- PR C3: Inbox assignee filter + thread assignment UI

---

## 5. Batch D: Team Subscription / RevenueCat Billing

### 5.1 Scope

Seat-based team billing via RevenueCat. This is the most product-decision-heavy batch.

### 5.2 Open Questions (Need Product Input)

1. **Pricing model:** Flat tiers (e.g., Team 5/$49, Team 10/$89) vs. pay-per-seat?
2. **Free tier:** Can orgs exist without a team subscription? How many free seats?
3. **Seat enforcement:** Hard block (can't invite beyond seat count) vs. soft warning?
4. **Trial:** Does team plan get a separate trial period from individual?
5. **Upgrade path:** Existing individual subscribers — auto-upgrade or separate purchase?
6. **Owner billing:** Only the owner pays, or can any admin manage billing?

### 5.3 Data Model (Tentative — Pending Product Decisions)

**New entity: `TeamSubscription`**

```typescript
@Entity("team_subscriptions")
class TeamSubscription {
  id: string; // uuid PK
  organizationId: string; // FK → organizations
  revenueCatSubscriptionId: string;
  productId: string; // RevenueCat product ID
  maxSeats: number; // seat limit from plan
  status: "active" | "trial" | "expired" | "cancelled";
  currentPeriodEnd: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

### 5.4 Enforcement Points

- `OrganizationsService.inviteMember()` — check seat count before allowing invite.
- New `TeamSubscriptionGuard` — protect team-only features.
- `SubscriptionsService` — extend webhook handler for team subscription events.

### 5.5 Frontend

- Upgrade CTA in TeamSettings when at seat limit.
- Seat usage indicator ("3/5 seats used").
- Billing management link (RevenueCat customer portal or in-app).

### 5.6 Estimated PRs: 2–3

- PR D1: TeamSubscription entity + migration + seat enforcement in invite flow
- PR D2: RevenueCat webhook extension for team events
- PR D3: Frontend billing UI in TeamSettings

---

## 6. Batch E: E2E Journey Tests

### 6.1 Scope

End-to-end tests covering the full team lifecycle.

### 6.2 Test Scenarios

1. **Org creation:** User creates org → becomes owner → org appears in settings.
2. **Invite flow:** Owner invites member → email sent → member opens accept link → member accepted.
3. **Role management:** Owner changes member role → member sees updated permissions.
4. **Thread assignment:** Owner assigns thread to member → member sees it in "Assigned to me" filter.
5. **Member removal:** Admin deactivates member → member loses access → deactivated in member list.
6. **Invite edge cases:** Expired invite, wrong email, duplicate invite, deactivated re-invite.
7. **Seat enforcement (if Batch D done):** At seat limit → invite blocked → upgrade CTA shown.

### 6.3 Estimated PRs: 1–2

---

## 7. Implementation Order & Dependencies

```
Batch A (✅ DONE) → Batch B → Batch C → Batch D → Batch E
                      │          │
                      │          ├── C1 (AcceptInvite) can start immediately
                      │          ├── C2 (TeamSettings) can start immediately
                      │          └── C3 (Inbox filter) depends on B
                      │
                      └── B has no external dependencies
```

**Recommended order:**

1. **Batch B** (thread assignment API) — 1–2 PRs
2. **Batch C1** (AcceptInvite page) — 1 PR (can parallel with B)
3. **Batch C2** (TeamSettings UI) — 1 PR (can parallel with B)
4. **Batch C3** (Inbox assignee filter + assignment UI) — 1 PR (after B merges)
5. **Batch D** (billing) — 2–3 PRs (after product decisions, can parallel with C)
6. **Batch E** (E2E tests) — 1–2 PRs (after C and D)

**Total estimated PRs remaining:** 7–10

---

## 8. Security Considerations

- **Org isolation:** All thread queries must verify the assignee belongs to the same org as the thread owner. Never allow cross-org assignment.
- **Invite token security:** Already implemented (32-byte crypto-random hex, 7-day expiry, single-use, cleared on accept). No changes needed.
- **Email encryption:** All email fields use `emailTransformer` (AES-256-GCM). Maintain this pattern for any new email-related fields.
- **JWT claims:** Consider adding `organizationId` and `orgRole` to JWT claims in a future optimisation PR to reduce DB lookups per request. Not blocking for initial implementation.
- **Rate limiting:** Invite endpoint should be rate-limited to prevent invite spam (e.g., max 20 invites per org per hour).

---

## 9. Migration Safety

- `assigneeId` column is nullable with `ON DELETE SET NULL` — safe to add without backfill.
- `TeamSubscription` table is new — no existing data concerns.
- All migrations should be idempotent and have down() methods.

---

## 10. Risks & Mitigations

| Risk                                               | Likelihood | Impact   | Mitigation                                                                                                                 |
| -------------------------------------------------- | ---------- | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| Billing model not decided → Batch D blocked        | High       | Medium   | Implement B+C first; D can ship later. Org + invite flow works without billing.                                            |
| Cross-org data leak via assignment                 | Low        | Critical | Enforce org membership check on every assignment. Add DB-level check constraint if possible.                               |
| Inbox query performance with assignee join         | Low        | Medium   | `assigneeId` is on the same table (no join needed). Index covers it.                                                       |
| AcceptInvite UX for users without existing account | Medium     | Medium   | Support both login + signup flows from accept page. Redirect back to accept after auth.                                    |
| Email provider connection sharing (not in scope)   | N/A        | N/A      | Explicitly out of scope. Each user connects their own email accounts. Team feature is assignment-only, not shared mailbox. |

---

## 11. Out of Scope

These are **not** part of this plan:

- Shared email account connections (each user manages their own)
- Shared categories/rules across org members
- Real-time collaboration (multiple users viewing same thread)
- Org admin dashboard (beyond TeamSettings in user settings)
- Cross-org thread sharing
- Org-level API keys or service accounts

---

> 🤖 Created by **Monk of Modularity** (AI planning agent) via OpenClaw.
