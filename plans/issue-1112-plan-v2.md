# Implementation Plan v2: Team Accounts (#1112) — Subscription Unification

> **Status:** Replanning — supersedes `issue-1112-plan.md`
> **References:** Issue #1112, PR #1424 (rework needed), PR #1250 (Batch A — merged)
> **Author:** Monk of Modularity (AI planning agent)
> **Date:** 2026-03-24

---

## 0. Why This Replan Exists

PR #1424 implemented Batches B–E but diverged from Jeremy's final product decisions:

1. **Created a separate `TeamSubscription` entity** — Jeremy explicitly said NO. Unify with existing subscription logic.
2. **Touched unrelated context-analysis files** (finalizer, progress, batch-analysis, qa-extraction, compression, cleanup, helpers, orchestrator) — these are not team accounts work.
3. **Original plan referenced Koyeb** — all infra is AWS.
4. **Pricing/billing model was incomplete** — Jeremy confirmed final decisions on 2026-03-24.

This v2 plan corrects all of the above.

---

## 1. Jeremy's Final Product Decisions (2026-03-24)

| Decision | Detail |
|----------|--------|
| Seat pricing | **$5/user/month** per seat |
| Volume tier — Starter | 3,000 emails/month → **$10/month** |
| Volume tier — Growth | 10,000 emails/month → **$20/month** |
| Volume tier — Business | 30,000 emails/month → **$50/month** |
| Billing provider | **RevenueCat** (not Stripe directly) |
| Free seats | **0** — every seat must be paid |
| Free tier | **None** — ALL existing users need a plan |
| Billing management | Admins can manage billing (not just owner) |
| Discount/promo codes | Required — use RevenueCat Promotional Offers + promo codes |
| Subscription architecture | **DO NOT create TeamSubscription** — extend existing `User.subscriptionStatus` + `SubscriptionsService` |
| Infrastructure | **AWS only** (no Koyeb references) |

---

## 2. What to KEEP from PR #1424

These components are correctly implemented and should be preserved:

### Frontend (Batch C) ✅ Keep
| File | Notes |
|------|-------|
| `client/src/pages/AcceptInvite.tsx` | Good — handles loading/invalid/valid states, redirect flow |
| `client/src/components/settings/TeamSettingsSection.tsx` | Good — member list, role mgmt, remove, invite form. Uses `ConfirmModal` + `theme.colors` ✅ |
| `client/src/queries/useAcceptInvite.ts` | Good |
| `client/src/queries/useValidateInvite.ts` | Good |
| `client/src/queries/useMyOrganization.ts` | Good |
| `client/src/queries/useThreadAssignment.ts` | Good — already aligned with #1425's API contract |
| `client/src/App.tsx` (route additions) | Good — `/accept-invite/:token` route |
| `client/src/pages/Settings.tsx` (TeamSettings integration) | Good |
| `client/src/locales/en.json` / `es.json` (team.* keys) | Good |

### E2E Tests (Batch E) ✅ Keep
| File | Notes |
|------|-------|
| `e2e/tests/teams-journey.spec.ts` | Good — covers invite, settings, assignment flows |

### Organization Service Enhancements ✅ Keep
| File | Notes |
|------|-------|
| `server/src/organizations/organizations.service.ts` | Helpers (`getOrgMembersForUser`, `findActiveMembership`, `areInSameOrg`) are fine |
| `server/src/organizations/organizations.service.spec.ts` | Tests are fine |
| `server/src/organizations/organizations.controller.ts` | Seats endpoint needs rework (see §4) |
| `server/src/organizations/organizations.module.ts` | Needs rework — remove TeamSubscription references |

### Inbox Filter Wiring ✅ Keep
| File | Notes |
|------|-------|
| `server/src/emails/email-inbox.service.ts` | `assigneeId` filter is correct |
| `server/src/emails/emails.module.ts` | Keep, but remove any TeamSubscription imports |

---

## 3. What to REMOVE from PR #1424

### TeamSubscription Entity + Service ❌ Remove entirely
| File | Action |
|------|--------|
| `server/src/database/entities/team-subscription.entity.ts` | **DELETE** |
| `server/src/database/migrations/1789000000000-CreateTeamSubscription.ts` | **DELETE** |
| `server/src/organizations/team-subscription.service.ts` | **DELETE** |
| `server/src/organizations/team-subscription.service.spec.ts` | **DELETE** |
| `server/src/database/entities/index.ts` | Remove `TeamSubscription` export |

### Unrelated Context Files ❌ Revert all changes
| File | Action |
|------|--------|
| `server/src/context/context-analysis-finalizer.service.ts` | **REVERT** — not team accounts work |
| `server/src/context/context-analysis-progress.service.ts` | **REVERT** |
| `server/src/context/context-batch-analysis.processor.ts` | **REVERT** |
| `server/src/context/context-finalization.processor.ts` | **REVERT** |
| `server/src/context/context-qa-extraction.service.ts` | **REVERT** |
| `server/src/context/context.module.ts` | **REVERT** |
| `server/src/context/context.service.ts` | **REVERT** |

> If these context changes fix real bugs, they should go in a **separate PR** for that issue.

### Gmail Provider Changes ❌ Evaluate
| File | Action |
|------|--------|
| `server/src/emails/providers/gmail-sync.service.ts` | **REVERT** unless directly related to team accounts |
| `server/src/emails/providers/gmail.provider.ts` | **REVERT** unless directly related to team accounts |

---

## 4. New Architecture: Extending Existing Subscription Model

### 4.1 Design Principle

Instead of a separate `TeamSubscription` entity, we extend the existing per-user subscription model. The **Organization** entity gains fields for seat management and volume tracking. The existing `SubscriptionsService` gains team-aware methods.

### 4.2 Schema Changes

#### 4.2.1 Add to `Organization` entity (new migration)

```typescript
// Organization entity additions:

@Column({ type: "int", default: 0, comment: "Max paid seats for this org" })
maxSeats: number;

@Column({ 
  type: "varchar", 
  nullable: true, 
  comment: "RevenueCat subscription ID for the org-level billing" 
})
revenueCatOrgSubscriptionId: string | null;

@Column({ 
  type: "varchar", 
  nullable: true, 
  comment: "Volume tier product ID from RevenueCat (starter|growth|business)" 
})
volumeTierProductId: string | null;

@Column({ 
  type: "int", 
  default: 0, 
  comment: "Emails processed this billing cycle" 
})
emailsUsedThisCycle: number;

@Column({ 
  type: "int", 
  default: 3000, 
  comment: "Email volume limit based on tier" 
})
emailVolumeLimit: number;

@Column({ 
  type: "timestamp", 
  nullable: true, 
  comment: "Start of current billing cycle for volume tracking" 
})
billingCycleStart: Date | null;
```

**Migration name:** `AddOrgBillingFields`

#### 4.2.2 No changes to `User` entity

The existing `User.subscriptionStatus`, `User.revenueCatUserId`, `User.subscriptionExpiresAt`, `User.trialStartedAt` fields remain as-is. They continue to represent individual subscription state. Team members get their subscription status set to `"active"` when they're on a paid seat.

### 4.3 Subscription Flow — How It Works

#### For individual users (existing, unchanged):
1. User signs up → gets trial or must subscribe
2. `SubscriptionsService.checkSubscriptionStatus()` → checks RevenueCat
3. `SubscriptionGuard` enforces active subscription

#### For team/org users (new):
1. Org owner buys seats via RevenueCat (seat-based product)
2. RevenueCat webhook → `SubscriptionsService.handleOrgWebhook()` → updates `Organization.maxSeats`
3. When admin invites a member and they accept → `SubscriptionsService.activateTeamSeat(userId, orgId)`
   - Sets `User.subscriptionStatus = "active"`
   - Sets `User.subscriptionExpiresAt` to org billing period end
   - Links via org membership (no new FK needed — `OrganizationMember` already exists)
4. When member is removed → `SubscriptionsService.deactivateTeamSeat(userId)`
   - Reverts `User.subscriptionStatus` to `"expired"` (unless they have their own individual sub)
5. `SubscriptionGuard` works unchanged — it just checks `User.subscriptionStatus`

#### Seat enforcement:
- **Hard block:** Cannot invite beyond `Organization.maxSeats`
- Count: `SELECT COUNT(*) FROM organization_members WHERE organizationId = :orgId AND status = 'active'`
- Enforced in `OrganizationsService.inviteMember()` (already has a check — just wire to org, not TeamSubscription)

### 4.4 Email Volume Tracking

#### New service method: `SubscriptionsService.trackEmailProcessed(orgId: string)`
- Called after each email is processed for an org member
- Increments `Organization.emailsUsedThisCycle`
- When limit hit → log warning, return `{ allowed: false }` to caller
- At 80% → surface warning in API response (frontend shows banner)

#### Volume tier mapping:
```typescript
const VOLUME_TIERS = {
  'bearlymail_starter': { limit: 3000, price: 10 },
  'bearlymail_growth':  { limit: 10000, price: 20 },
  'bearlymail_business': { limit: 30000, price: 50 },
} as const;
```

#### Billing cycle reset:
- RevenueCat webhook on `RENEWAL` → reset `emailsUsedThisCycle = 0`, update `billingCycleStart`

### 4.5 RevenueCat Integration Extensions

#### New webhook event handling in `SubscriptionsService.handleWebhook()`:

Extend the existing switch cases to handle org-level subscription events:

```typescript
// Identify org subscriptions by product_id prefix or metadata
// e.g., product IDs: bearlymail_seat_monthly, bearlymail_starter, bearlymail_growth, bearlymail_business

case 'INITIAL_PURCHASE':
case 'RENEWAL':
  if (isOrgProduct(event.product_id)) {
    await this.handleOrgSubscriptionEvent(event);
  } else {
    // existing individual logic
  }
  break;
```

**`handleOrgSubscriptionEvent(event)`:**
1. Look up org by `revenueCatOrgSubscriptionId` or `app_user_id` (owner's RevenueCat ID)
2. Update `Organization.maxSeats` based on seat quantity from RevenueCat
3. Update volume tier if volume product changed
4. Reset `emailsUsedThisCycle` on renewal
5. Activate/update subscription status for all active org members

#### New endpoint: `POST /subscriptions/org/link-revenuecat`
- Links an org to a RevenueCat subscription
- Only callable by org owner or admin
- Sets `Organization.revenueCatOrgSubscriptionId`

### 4.6 Promo Code / Discount Support

RevenueCat natively supports:
- **Promotional Offers** (iOS/Android) — for app-based billing
- **Promo Codes** — can be created via RevenueCat dashboard or API

#### Implementation:
1. **Admin endpoint:** `POST /subscriptions/apply-promo` — accepts a promo code, validates via RevenueCat API, applies entitlement
2. **Complimentary access:** Use RevenueCat's "Grant a Promotional Entitlement" API (`POST /v1/subscribers/{app_user_id}/entitlements/{entitlement_id}/promotional`)
3. **Backend method:** `SubscriptionsService.grantComplimentaryAccess(userId, durationDays)` — calls RevenueCat API to grant entitlement, then updates local `User.subscriptionStatus`

### 4.7 Enrolling ALL Existing Users

**Migration or one-time script:**

All existing users must be enrolled in a plan. Options:

1. **DB migration approach** (preferred — deterministic):
   ```sql
   -- Set all users without active subscription to a default state
   UPDATE users 
   SET "subscriptionStatus" = 'active',
       "subscriptionExpiresAt" = NOW() + INTERVAL '30 days'
   WHERE "subscriptionStatus" IS NULL 
      OR "subscriptionStatus" = '' 
      OR "subscriptionStatus" = 'none';
   ```
   This gives everyone a 30-day grace period to link their RevenueCat subscription.

2. **RevenueCat bulk enroll:** Use RevenueCat API to create subscribers for all existing users and grant them a promotional entitlement for the transition period.

**Recommendation:** Use approach 1 (migration) for the DB state + approach 2 for RevenueCat sync. The migration ensures immediate access; the RevenueCat sync ensures billing picks up correctly.

---

## 5. Seats Endpoint Rework

The current PR has `GET /organizations/seats` backed by `TeamSubscriptionService.getSeatUsage()`. This needs to change:

**New implementation in `OrganizationsService`:**

```typescript
async getSeatUsage(orgId: string): Promise<{
  activeSeats: number;
  maxSeats: number;
  canInvite: boolean;
}> {
  const org = await this.orgRepository.findOneOrFail({ where: { id: orgId } });
  const activeSeats = await this.memberRepository.count({
    where: { organizationId: orgId, status: 'active' },
  });
  return {
    activeSeats,
    maxSeats: org.maxSeats,
    canInvite: activeSeats < org.maxSeats,
  };
}
```

The controller endpoint stays at `GET /organizations/seats` but calls `OrganizationsService` instead of the deleted `TeamSubscriptionService`.

---

## 6. Volume Usage Endpoint

**New endpoint:** `GET /organizations/usage`

```typescript
async getVolumeUsage(orgId: string): Promise<{
  emailsUsed: number;
  emailLimit: number;
  percentUsed: number;
  tier: string;
}> {
  const org = await this.orgRepository.findOneOrFail({ where: { id: orgId } });
  return {
    emailsUsed: org.emailsUsedThisCycle,
    emailLimit: org.emailVolumeLimit,
    percentUsed: Math.round((org.emailsUsedThisCycle / org.emailVolumeLimit) * 100),
    tier: org.volumeTierProductId || 'none',
  };
}
```

Frontend should show this in TeamSettings with a usage bar + warning at 80%/100%.

---

## 7. Implementation Batches (for Codebeard)

### Batch R1: Remove & Revert (cleanup PR #1424)
1. Delete `team-subscription.entity.ts`, migration `1789000000000`, `team-subscription.service.ts`, `team-subscription.service.spec.ts`
2. Remove `TeamSubscription` from `entities/index.ts`
3. Revert ALL `server/src/context/` changes
4. Revert `server/src/emails/providers/gmail-sync.service.ts` and `gmail.provider.ts` if unrelated
5. Remove TeamSubscription imports from `organizations.module.ts` and `emails.module.ts`
6. Update `organizations.controller.ts` seats endpoint to call `OrganizationsService` directly

### Batch R2: Extend Organization + SubscriptionsService
1. Add billing fields to `Organization` entity (§4.2.1)
2. Create migration `AddOrgBillingFields`
3. Add to `SubscriptionsService`:
   - `activateTeamSeat(userId, orgId)` 
   - `deactivateTeamSeat(userId)`
   - `handleOrgSubscriptionEvent(event)` (extend existing webhook handler)
   - `trackEmailProcessed(orgId)`
   - `grantComplimentaryAccess(userId, durationDays)`
4. Add to `OrganizationsService`:
   - `getSeatUsage(orgId)` (moved from TeamSubscriptionService)
   - `getVolumeUsage(orgId)`
5. Wire seat enforcement in `inviteMember()` to use `Organization.maxSeats`
6. Add `POST /subscriptions/apply-promo` endpoint
7. Add `POST /subscriptions/org/link-revenuecat` endpoint
8. Add `GET /organizations/usage` endpoint

### Batch R3: Existing User Enrollment
1. Migration: set all users to `subscriptionStatus = 'active'` with 30-day grace period
2. Document RevenueCat bulk sync process for ops team

### Batch R4: Frontend Updates (if needed)
1. Add volume usage display to `TeamSettingsSection`
2. Add usage warning banner (80%/100% threshold)
3. Add promo code input in billing section
4. Ensure billing management is accessible to admins (not just owner)

### Batch R5: Tests
1. Update org service tests for seat enforcement via `Organization.maxSeats`
2. Add subscription service tests for team seat activation/deactivation
3. Add volume tracking tests
4. Update E2E tests if any reference TeamSubscription

---

## 8. Files Affected (Summary)

| File | Action |
|------|--------|
| `server/src/database/entities/team-subscription.entity.ts` | DELETE |
| `server/src/database/entities/index.ts` | Remove TeamSubscription export |
| `server/src/database/entities/organization.entity.ts` | ADD billing fields |
| `server/src/database/migrations/1789000000000-CreateTeamSubscription.ts` | DELETE |
| `server/src/database/migrations/XXXXXX-AddOrgBillingFields.ts` | CREATE |
| `server/src/database/migrations/XXXXXX-EnrollExistingUsers.ts` | CREATE |
| `server/src/organizations/team-subscription.service.ts` | DELETE |
| `server/src/organizations/team-subscription.service.spec.ts` | DELETE |
| `server/src/organizations/organizations.service.ts` | ADD seat/volume methods |
| `server/src/organizations/organizations.controller.ts` | REWORK seats endpoint |
| `server/src/organizations/organizations.module.ts` | REMOVE TeamSubscription refs |
| `server/src/subscriptions/subscriptions.service.ts` | EXTEND with team methods |
| `server/src/subscriptions/subscriptions.controller.ts` | ADD promo + org-link endpoints |
| `server/src/emails/emails.module.ts` | REMOVE TeamSubscription refs |
| `server/src/context/*` | REVERT all changes |
| `server/src/emails/providers/gmail*.ts` | REVERT if unrelated |
| `client/src/components/settings/TeamSettingsSection.tsx` | ADD volume usage UI |

---

## 9. Open Questions (for Jeremy)

1. **Grace period for existing users:** 30 days suggested — is that right, or should it be longer?
2. **Volume tracking granularity:** Count per email processed, or per email thread? (Recommend: per email processed)
3. **What happens when volume limit is hit?** Hard block (stop processing) or soft limit (continue but warn + upsell)?
4. **Solo users (no org):** Do solo users also need volume tiers, or is volume tracking org-only?
5. **RevenueCat product IDs:** Need actual product IDs configured in RevenueCat before Codebeard can wire them up. Who creates these?

---

*🧘 The path to clean architecture runs through removing what doesn't belong, not adding what doesn't fit. — Monk of Modularity*
