# Plan: Pause AI email processing after 3 days of user inactivity (Issue #1459)

## Problem Statement

BearlyMail spends AI compute (priority analysis, summarisation, context analysis, auto-responder, suggested replies) on every incoming email for every user — even users who haven't logged in for days. If a user hasn't accessed BearlyMail for 3+ days, we should defer AI processing until they return, saving API costs without losing any emails.

---

## Architecture Overview

### Current Flow

```
Email arrives → email-sync.processor schedules fetch per user
  → email-lifecycle.service.createEmail()
    → queuePostSaveJobs() queues:
      - REFINE_PRIORITY / REFINE_PRIORITY_BATCH (priority analysis)
      - GENERATE_SUMMARY (LLM summarisation)
      - AUTO_RESPONDER (auto-reply)
      - FETCH_GITHUB_METADATA
      - suggested reply regeneration (for starred threads)
```

All users are fetched via `usersService.findAll()` in the scheduler — no activity filter exists.

### Proposed Flow

```
Email arrives → email-sync.processor schedules fetch per user
  → email-lifecycle.service.createEmail()
    → Check: is user active (lastActivityAt within 3 days)?
      YES → queuePostSaveJobs() as normal
      NO  → save email with aiProcessingDeferred=true on thread, skip AI jobs
            Email is synced and visible but without AI enrichment

User logs in → auth.service.login() updates lastActivityAt
  → if user was inactive (>3 days), trigger backlog processing
  → queue REFINE_PRIORITY_BATCH + GENERATE_SUMMARY for deferred threads
```

---

## Detailed Changes

### 1. Database Schema

#### 1a. User entity — add `lastActivityAt`

**File:** `server/src/database/entities/user.entity.ts`

```typescript
@Column({
  nullable: true,
  comment: "When user last accessed BearlyMail (login, API call, etc.)",
})
@Index()
lastActivityAt: Date | null;
```

**Why `lastActivityAt` not `lastLoginAt`:** A user might stay logged in with an active JWT for weeks — "last login" wouldn't capture ongoing usage. We'll update this on login AND on periodic API activity (e.g., the JWT guard can touch it every N hours to avoid write amplification).

#### 1b. EmailThread entity — add `aiProcessingDeferred`

**File:** `server/src/database/entities/email-thread.entity.ts`

```typescript
@Column({
  default: false,
  comment: "True when AI processing was skipped because user was inactive",
})
aiProcessingDeferred: boolean;
```

This flag lets the frontend distinguish "not yet processed" from "processing failed" and lets the backlog processor know which threads to catch up on.

#### 1c. Migration

**File:** `server/src/database/migrations/1788000000000-AddInactivityTrackingColumns.ts`

- Add `lastActivityAt` (nullable Date) to `users` table with index
- Add `aiProcessingDeferred` (boolean, default false) to `email_threads` table
- Backfill `lastActivityAt` from `updatedAt` for existing users (reasonable approximation)

---

### 2. Backend: Activity Tracking

#### 2a. Update `lastActivityAt` on login

**File:** `server/src/auth/auth.service.ts` → `login()` method

After successful auth, update the user's `lastActivityAt`:

```typescript
async login(user: UserWithoutPassword) {
  // ... existing approval check ...

  // Track login activity
  await this.usersService.updateLastActivity(user.id);

  // ... existing JWT generation ...
}
```

This covers all three login paths (email/password, Google callback, Microsoft callback, Zoho callback) since they all call `authService.login()`.

#### 2b. Periodic activity tracking via JWT guard

**File:** `server/src/auth/jwt-auth.guard.ts`

To avoid missing active users who stay logged in (never re-login), touch `lastActivityAt` on authenticated API requests — but throttled to once per hour to avoid write amplification:

```typescript
// After JWT validation succeeds:
const user = request.user;
const ONE_HOUR = 60 * 60 * 1000;
if (
  !user.lastActivityAt ||
  Date.now() - user.lastActivityAt.getTime() > ONE_HOUR
) {
  // Fire-and-forget — don't block the request
  this.usersService.updateLastActivity(user.id).catch(() => {});
}
```

#### 2c. UsersService helper

**File:** `server/src/users/users.service.ts`

```typescript
async updateLastActivity(userId: string): Promise<void> {
  await this.userRepository.update(userId, { lastActivityAt: new Date() });
}

async isUserActive(userId: string, thresholdDays = 3): Promise<boolean> {
  const user = await this.userRepository.findOne({
    where: { id: userId },
    select: ['id', 'lastActivityAt'],
  });
  if (!user?.lastActivityAt) return false;
  const threshold = new Date(Date.now() - thresholdDays * 24 * 60 * 60 * 1000);
  return user.lastActivityAt > threshold;
}

async findInactiveUserIds(thresholdDays = 3): Promise<string[]> {
  const threshold = new Date(Date.now() - thresholdDays * 24 * 60 * 60 * 1000);
  const users = await this.userRepository.find({
    where: [
      { lastActivityAt: LessThan(threshold) },
      { lastActivityAt: IsNull() },
    ],
    select: ['id'],
  });
  return users.map(u => u.id);
}
```

---

### 3. Backend: Inactivity Gate (Skip AI for Inactive Users)

#### 3a. Gate in `email-lifecycle.service.ts`

**Where:** In `createEmail()`, before calling `queuePostSaveJobs()`.

The gate should be at the **job-queueing level**, not the job-processing level, because:

- It avoids creating jobs that would just be immediately skipped (less queue noise)
- It keeps the individual processors (LLM, summary, etc.) simple and unchanged
- It's a single checkpoint rather than duplicating the check in 5+ processors

```typescript
async createEmail(userId, emailData, options, queueBatchPriorityRefinement) {
  // ... existing blocked sender check, thread creation, save ...

  const isActive = await this.usersService.isUserActive(userId);

  if (!isActive) {
    // User inactive >3 days — save email but defer AI processing
    thread.aiProcessingDeferred = true;
    thread.isProcessingPriority = false;
    await this.emailThreadRepository.save(thread);

    savedEmail.isProcessingSummary = false;
    await this.emailRepository.save(savedEmail);

    this.logger.log(
      `Skipping AI processing for user ${userId} (inactive >3 days), thread ${thread.id}`,
    );
    return savedEmail;
  }

  // ... existing flow: queuePostSaveJobs() ...
}
```

**Note:** Email sync itself (fetching from Gmail/O365) still runs for inactive users. We only skip the AI enrichment. This ensures no emails are ever lost.

#### 3b. Alternative considered: gate at scheduler level

We could skip `FETCH_USER_EMAILS` entirely for inactive users in `email-sync.processor.ts`. However, this risks missing emails if the user returns — we'd need a full re-sync on login. The current approach (sync emails but skip AI) is safer and simpler.

---

### 4. Backend: Resume on Login (Backlog Processing)

#### 4a. Trigger backlog processing in `auth.service.ts`

**File:** `server/src/auth/auth.service.ts` → `login()` method

```typescript
async login(user: UserWithoutPassword) {
  // ... existing approval check ...

  // Check if user was inactive and needs backlog processing
  const wasInactive = await this.usersService.wasUserInactive(user.id);

  // Track login activity (updates lastActivityAt)
  await this.usersService.updateLastActivity(user.id);

  if (wasInactive) {
    // Queue backlog processing for deferred threads
    await this.emailBacklogService.queueBacklogProcessing(user.id);
  }

  // ... existing JWT generation ...
}
```

#### 4b. New service: `EmailBacklogService`

**File:** `server/src/emails/email-backlog.service.ts`

```typescript
@Injectable()
export class EmailBacklogService {
  constructor(
    @Inject("PG_BOSS") private boss: PgBoss,
    @InjectRepository(EmailThread) private threadRepo: Repository<EmailThread>,
    @InjectRepository(Email) private emailRepo: Repository<Email>,
  ) {}

  async queueBacklogProcessing(
    userId: string,
  ): Promise<{ threadCount: number }> {
    // Find all deferred threads for this user
    const deferredThreads = await this.threadRepo.find({
      where: { userId, aiProcessingDeferred: true },
      select: ["id"],
    });

    if (deferredThreads.length === 0) return { threadCount: 0 };

    // Queue priority batch for all deferred threads at once
    await this.boss.send(
      JOB_NAMES.REFINE_PRIORITY_BATCH,
      {
        userId,
        threadIds: deferredThreads.map((t) => t.id),
        isBacklogProcessing: true,
      },
      {
        priority: getJobPriority(JOB_NAMES.REFINE_PRIORITY_BATCH, false),
        singletonKey: `backlog-priority-${userId}`,
      },
    );

    // Queue summary generation for latest email in each deferred thread
    for (const thread of deferredThreads) {
      const latestEmail = await this.emailRepo.findOne({
        where: { emailThreadId: thread.id },
        order: { receivedAt: "DESC" },
        select: ["id"],
      });
      if (latestEmail) {
        await this.boss.send(
          JOB_NAMES.GENERATE_SUMMARY,
          {
            userId,
            emailId: latestEmail.id,
            threadId: thread.id,
            isBacklogProcessing: true,
          },
          {
            priority: getJobPriority(
              JOB_NAMES.GENERATE_SUMMARY_BACKGROUND,
              false,
            ),
            singletonKey: `backlog-summary-${thread.id}`,
          },
        );
      }
    }

    return { threadCount: deferredThreads.length };
  }

  async getBacklogProgress(userId: string): Promise<{
    total: number;
    remaining: number;
    isProcessing: boolean;
  }> {
    const [total, remaining] = await Promise.all([
      this.threadRepo.count({
        where: { userId, aiProcessingDeferred: true },
      }),
      // Remaining = still deferred (not yet processed)
      // Once processing completes, the processors clear aiProcessingDeferred
      this.threadRepo.count({
        where: { userId, aiProcessingDeferred: true },
      }),
    ]);

    return {
      total,
      remaining,
      isProcessing: remaining > 0,
    };
  }
}
```

#### 4c. Clear `aiProcessingDeferred` after processing

In the existing processors (`LLMProcessor.handleRefinePriorityJob`, `LLMSummaryProcessorService`), after successful processing, clear the flag:

```typescript
// After successful priority/summary processing:
if (thread.aiProcessingDeferred) {
  thread.aiProcessingDeferred = false;
  await this.emailThreadRepository.save(thread);
}
```

#### 4d. API endpoint for backlog progress

**File:** `server/src/emails/emails.controller.ts`

```typescript
@Get('backlog-progress')
@UseGuards(JwtAuthGuard)
async getBacklogProgress(@Request() req) {
  return this.emailBacklogService.getBacklogProgress(req.user.id);
}
```

---

### 5. Frontend: Unprocessed Email Indicators

#### 5a. Thread type update

**File:** `client/src/types/email.ts`

Add `aiProcessingDeferred: boolean` to the thread type used by the frontend.

#### 5b. Visual indicator on unprocessed threads

**File:** `client/src/components/inbox/` (thread list rendering)

For threads where `aiProcessingDeferred === true`:

- Show a subtle badge/icon (e.g., a small clock or "⏸" icon) next to the thread
- Grey out the priority/category indicators (since they're empty/default)
- Tooltip: "AI processing was paused while you were away. Processing now..."

**Design principle:** Don't alarm the user. The indicator should be informational, not error-like.

#### 5c. "Catching up" banner

**File:** `client/src/components/inbox/overlays/CatchingUpBanner.tsx` (new)

Pattern follows existing `ReloginBanner.tsx`:

```tsx
export const CatchingUpBanner: React.FC = () => {
  const { data: progress } = useBacklogProgress();

  if (!progress?.isProcessing) return null;

  return (
    <div className="catching-up-banner">
      <Spinner size="sm" />
      <span>
        {t("inbox.catchingUp", {
          remaining: progress.remaining,
          total: progress.total,
        })}
      </span>
    </div>
  );
};
```

**Placement:** At the top of the inbox, below the category tabs, above the thread list. Same position as `ReloginBanner`.

#### 5d. Polling for progress

Use a React Query hook that polls `/emails/backlog-progress` every 10 seconds while `isProcessing` is true, then stops:

```typescript
const useBacklogProgress = () => {
  return useQuery({
    queryKey: ["backlog-progress"],
    queryFn: () => api.get("/emails/backlog-progress"),
    refetchInterval: (data) => (data?.isProcessing ? 10_000 : false),
    staleTime: 5_000,
  });
};
```

---

### 6. Edge Cases

#### 6a. Emails arriving at the 3-day boundary

The check is `lastActivityAt > (now - 3 days)`. If a user's last activity was exactly 72 hours ago, they're considered inactive. This is fine — the boundary is arbitrary and a few hours either way doesn't matter. No special handling needed.

#### 6b. User logs in briefly then leaves again

- On login, `lastActivityAt` is updated → user is "active"
- Backlog processing is triggered for deferred threads
- If user leaves immediately, the backlog jobs are already queued and will complete
- After 3 more days of inactivity, new emails will again be deferred
- This is correct behavior — the backlog from the previous absence gets processed, and a new deferral period starts

#### 6c. User with very large backlog (e.g., 1000 deferred threads)

- Priority batch processing already handles batching efficiently
- Summary generation uses singleton keys to prevent duplicates
- We should add a reasonable limit (e.g., process most recent 200 threads first) and process older ones in subsequent batches
- Consider adding a `backlogBatchSize` config to control this

#### 6d. Race condition: email arrives while backlog is processing

- New emails arriving after login (user is now active) go through normal processing
- Backlog emails are processed separately with `isBacklogProcessing: true` flag
- No conflict — PG-Boss singleton keys prevent duplicate jobs per thread

#### 6e. User never logged in (new user who signed up but never returned)

- `lastActivityAt` would be null (or set to `createdAt` via backfill)
- `isUserActive()` returns false for null `lastActivityAt`
- AI processing would be deferred — this is correct, no point processing emails for a user who never came back

#### 6f. Multiple OAuth provider logins

All login paths (Google, Microsoft, Zoho, email/password) go through `auth.service.login()`, so activity tracking is consistent regardless of auth method.

---

### 7. Configuration

Add environment variable for the inactivity threshold:

```
AI_INACTIVITY_THRESHOLD_DAYS=3
```

Default: 3 days. This allows easy tuning without code changes.

---

### 8. Implementation Order

1. **Migration + Entity changes** — add `lastActivityAt` and `aiProcessingDeferred` columns
2. **Activity tracking** — `updateLastActivity()` in auth service + JWT guard throttle
3. **Inactivity gate** — skip AI jobs in `createEmail()` for inactive users
4. **Backlog service** — `EmailBacklogService` with queue and progress endpoint
5. **Clear deferred flag** — update LLM/summary processors to clear `aiProcessingDeferred`
6. **Frontend indicators** — deferred thread badge + catching-up banner
7. **Tests** — unit tests for inactivity check, backlog queueing, progress endpoint

### 9. Files Modified

| File                                                                           | Change                                                            |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `server/src/database/entities/user.entity.ts`                                  | Add `lastActivityAt` column                                       |
| `server/src/database/entities/email-thread.entity.ts`                          | Add `aiProcessingDeferred` column                                 |
| `server/src/database/migrations/1788000000000-AddInactivityTrackingColumns.ts` | New migration                                                     |
| `server/src/users/users.service.ts`                                            | Add `updateLastActivity()`, `isUserActive()`, `wasUserInactive()` |
| `server/src/auth/auth.service.ts`                                              | Track activity on login, trigger backlog                          |
| `server/src/auth/jwt-auth.guard.ts`                                            | Throttled activity touch on API requests                          |
| `server/src/emails/email-lifecycle.service.ts`                                 | Inactivity gate before AI job queueing                            |
| `server/src/emails/email-backlog.service.ts`                                   | New service for backlog processing                                |
| `server/src/emails/emails.controller.ts`                                       | New endpoint for backlog progress                                 |
| `server/src/emails/llm-processor.ts`                                           | Clear `aiProcessingDeferred` after processing                     |
| `server/src/emails/llm-summary-processor.service.ts`                           | Clear `aiProcessingDeferred` after processing                     |
| `client/src/types/email.ts`                                                    | Add `aiProcessingDeferred` to thread type                         |
| `client/src/components/inbox/overlays/CatchingUpBanner.tsx`                    | New catching-up banner                                            |
| `client/src/hooks/useBacklogProgress.ts`                                       | New hook for polling backlog progress                             |
| Various inbox components                                                       | Show deferred indicator on threads                                |

---

_Plan authored by Monk of Modularity 🧘 — issue #1459_
_Signed-off-by: openclaw-monk-of-modularity[bot]_
