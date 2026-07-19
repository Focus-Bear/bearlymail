import { Injectable, Logger } from "@nestjs/common";

import { BlockedSendersService } from "../blocked-senders/blocked-senders.service";
import { INBOX_MODES } from "../constants/query-limits";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { UsersService } from "../users/users.service";
import { EmailFollowUpService } from "./email-follow-up.service";
import { EmailInboxService } from "./email-inbox.service";
import {
  INBOX_OTHER_CATEGORY_NAME,
  INBOX_UNCATEGORIZED_CATEGORY_KEY,
} from "./email-inbox-category.service";
import { InboxEmail } from "./interfaces/inbox-email.interface";
import { PerformanceTracker } from "./performance-tracker";

export type CategoryFetchTraceMode = "triage" | "action" | "follow-up";

export interface CategoryFetchTraceDrop {
  threadId: string;
  stage:
    | "blocked_sender"
    | "category_filter"
    | "action_mode_user_sent_last"
    | "follow_up_mode_no_reply_pending"
    | "limit";
  reason: string;
}

/**
 * Per-thread breakdown for every thread the summary counted under this category.
 * Surfaces the two fields that decide WHY the accordion loaded zero: the resolved
 * category UUID/name (a real category literally named "Other" collides with the
 * null-bucket sentinel) and the account the representative email belongs to (rules
 * account-filtering in or out). Added for issue #2062.
 */
export interface CategoryFetchTraceThreadDetail {
  threadId: string;
  /** Representative email's resolved category UUID. null = genuinely uncategorized. */
  categoryId: string | null;
  /** Decrypted category display name (e.g. "Other"). */
  categoryName: string | null;
  /**
   * Client group key the email maps to TODAY (`category_id ?? "uncategorized"`).
   * If this is a UUID while `summaryBucketKey` is "uncategorized", the email files
   * under a key the Other accordion never looks up — the empty-category bug.
   */
  clientGroupKey: string;
  /** Key the summary's "Other" accordion looks up ("uncategorized" for the null bucket). */
  summaryBucketKey: string;
  /** True when clientGroupKey !== summaryBucketKey — i.e. this thread is an offender. */
  keyMismatch: boolean;
  /** Provider + account id of the representative email, for ruling account-filtering in/out. */
  account: {
    provider: "google" | "office365" | "zoho" | "unknown";
    accountId: string | null;
  };
  /** True if this summary-counted thread was returned by the unfiltered raw inbox query. */
  inRawQuery: boolean;
}

export interface CategoryFetchTrace {
  categoryId: string | null;
  /** Best-effort decrypted name; "Other" for the null-category bucket. */
  categoryName: string;
  mode: CategoryFetchTraceMode;
  /** Resolved UUID set the inbox endpoint would have used for the categoryIds filter. */
  resolvedCategoryUuids: string[];
  /** Whether the categoryId was treated as the "Other" / uncategorized bucket. */
  treatedAsOther: boolean;
  /** Threads the summary endpoint reported for this category at trace time. */
  summaryThreadIds: string[];
  /**
   * Threads returned by runInboxQuery (before any post-query filter).
   * NOT category-scoped — this is the full triage/action/follow-up universe.
   */
  rawQueryAllThreadIds: string[];
  /** Threads from the raw query that match the requested category. */
  rawQueryCategoryThreadIds: string[];
  /** Threads still present after the blocked-senders filter. */
  afterBlockedFilterThreadIds: string[];
  /** Threads still present after the categoryIds filter (mirrors applyPostQueryFilters). */
  afterCategoryFilterThreadIds: string[];
  /** Threads still present after the mode filter (action / follow-up). triage = no-op. */
  afterModeFilterThreadIds: string[];
  /** Per-thread drop reasons recorded as the trace replays each filter stage. */
  drops: CategoryFetchTraceDrop[];
  /** Threads that the summary listed but the raw inbox query did not return. */
  summaryOnlyThreadIds: string[];
  /** Threads in raw query but missing from summary (informational). */
  rawOnlyThreadIds: string[];
  /** Wall-clock between summary call and inbox call, useful for diagnosing race conditions. */
  summaryToRawDriftMs: number;
  /**
   * Per-thread category/account breakdown for the threads the summary counted.
   * The decisive evidence for issue #2062: shows whether a counted thread carries a
   * non-null categoryId whose name resolves to "Other" (naming collision → key
   * mismatch) versus being genuinely uncategorized, and which account it lives on.
   */
  summaryThreadDetails: CategoryFetchTraceThreadDetail[];
}

/**
 * Re-runs the inbox-fetch pipeline for a single category with per-stage
 * instrumentation so debug callers can see exactly which threads were dropped
 * at each filter and why. Used by issue #1954 to diagnose accordion
 * "summary shows N but loaded 0" mismatches.
 *
 * This deliberately does NOT mutate or short-circuit the production inbox
 * pipeline — instead it replays the same logic with tracing hooks. The
 * production code paths in EmailInboxService remain untouched so we don't
 * regress hot-path performance.
 */
@Injectable()
export class EmailInboxTraceService {
  private readonly logger = new Logger(EmailInboxTraceService.name);

  constructor(
    private readonly emailInboxService: EmailInboxService,
    private readonly blockedSendersService: BlockedSendersService,
    private readonly emailFollowUpService: EmailFollowUpService,
    private readonly usersService: UsersService,
  ) {}

  async traceCategoryFetch(
    userId: string,
    categoryId: string,
    mode: CategoryFetchTraceMode,
  ): Promise<CategoryFetchTrace> {
    const treatedAsOther =
      categoryId === INBOX_UNCATEGORIZED_CATEGORY_KEY ||
      categoryId === INBOX_OTHER_CATEGORY_NAME;

    const { summaryThreadIds, categoryName, summaryEndedAt } =
      await this.fetchSummaryForCategory(
        userId,
        mode,
        categoryId,
        treatedAsOther,
      );

    const rawStartedAt = Date.now();
    const rawRows = await this.emailInboxService.runInboxQuery(userId, mode);
    const decrypted: InboxEmail[] = rawRows.map((row) =>
      this.emailInboxService.decryptRawEmailRow(row),
    );
    const rawQueryAllThreadIds = rawRows.map((row) => row.threadId);

    const drops: CategoryFetchTraceDrop[] = [];
    const { kept: rawQueryCategoryEmails, requestedUuids } =
      this.applyCategoryFilter(decrypted, categoryId, treatedAsOther);
    this.recordCategoryDrops(
      decrypted,
      rawQueryCategoryEmails,
      { categoryId, treatedAsOther },
      drops,
      summaryThreadIds,
    );

    const afterBlockedFilter = await this.applyBlockedFilter(
      userId,
      rawQueryCategoryEmails,
      drops,
    );
    const afterModeFilter = await this.applyModeFilter(
      userId,
      mode,
      afterBlockedFilter,
      drops,
    );

    const summaryThreadDetails = this.buildSummaryThreadDetails(
      categoryId,
      summaryThreadIds,
      decrypted,
      treatedAsOther,
    );

    return this.buildTrace({
      categoryId,
      categoryName,
      mode,
      treatedAsOther,
      requestedUuids,
      summaryThreadIds,
      rawQueryAllThreadIds,
      rawQueryCategoryEmails,
      afterBlockedFilter,
      afterModeFilter,
      drops,
      driftMs: rawStartedAt - summaryEndedAt,
      summaryThreadDetails,
    });
  }

  /**
   * For each thread the summary counted, surface the category UUID/name and account
   * of its representative email — the evidence that decides issue #2062 between a
   * naming collision (real category named "Other" with a non-null UUID) and account
   * filtering. When `treatedAsOther`, the summary bucket key is always
   * "uncategorized", so any thread whose representative carries a non-null
   * `categoryId` is an offender (clientGroupKey is the UUID → key mismatch).
   */
  private buildSummaryThreadDetails(
    requestedCategoryId: string,
    summaryThreadIds: string[],
    decrypted: InboxEmail[],
    treatedAsOther: boolean,
  ): CategoryFetchTraceThreadDetail[] {
    const byThreadId = new Map<string, InboxEmail>();
    for (const email of decrypted) {
      if (!byThreadId.has(email.threadId))
        byThreadId.set(email.threadId, email);
    }
    return summaryThreadIds.map((threadId) => {
      const email = byThreadId.get(threadId);
      const categoryId = email?.categoryId ?? null;
      const categoryName = email?.category ?? null;
      const clientGroupKey = categoryId ?? INBOX_UNCATEGORIZED_CATEGORY_KEY;
      const summaryBucketKey = treatedAsOther
        ? INBOX_UNCATEGORIZED_CATEGORY_KEY
        : requestedCategoryId;
      return {
        threadId,
        categoryId,
        categoryName,
        clientGroupKey,
        summaryBucketKey,
        keyMismatch: clientGroupKey !== summaryBucketKey,
        account: this.resolveAccount(email),
        inRawQuery: email !== undefined,
      };
    });
  }

  private resolveAccount(email: InboxEmail | undefined): {
    provider: "google" | "office365" | "zoho" | "unknown";
    accountId: string | null;
  } {
    if (email?.googleAccountId) {
      return { provider: "google", accountId: email.googleAccountId };
    }
    if (email?.office365AccountId) {
      return { provider: "office365", accountId: email.office365AccountId };
    }
    if (email?.zohoAccountId) {
      return { provider: "zoho", accountId: email.zohoAccountId };
    }
    return { provider: "unknown", accountId: null };
  }

  private async fetchSummaryForCategory(
    userId: string,
    mode: CategoryFetchTraceMode,
    categoryId: string,
    treatedAsOther: boolean,
  ): Promise<{
    summaryThreadIds: string[];
    categoryName: string;
    summaryEndedAt: number;
  }> {
    const summary = await this.emailInboxService.getInboxSummary(userId, mode, {
      includeThreadIds: true,
    });
    const summaryEndedAt = Date.now();
    const matched = treatedAsOther
      ? summary.categories.find((cat) => cat.id === null)
      : summary.categories.find((cat) => cat.id === categoryId);
    return {
      summaryThreadIds: matched?.threadIds ?? [],
      categoryName:
        matched?.name ??
        (treatedAsOther ? INBOX_OTHER_CATEGORY_NAME : "(unknown)"),
      summaryEndedAt,
    };
  }

  private applyCategoryFilter(
    decrypted: InboxEmail[],
    categoryId: string,
    treatedAsOther: boolean,
  ): { kept: InboxEmail[]; requestedUuids: Set<string> } {
    const requestedUuids = treatedAsOther
      ? new Set<string>()
      : new Set([categoryId]);
    const kept = decrypted.filter((emailEntry) => {
      const isOtherThread =
        !emailEntry.categoryId ||
        emailEntry.category === INBOX_OTHER_CATEGORY_NAME;
      if (treatedAsOther) return isOtherThread;
      if (emailEntry.categoryId && !isOtherThread) {
        return requestedUuids.has(emailEntry.categoryId);
      }
      return false;
    });
    return { kept, requestedUuids };
  }

  private recordCategoryDrops(
    decrypted: InboxEmail[],
    kept: InboxEmail[],
    categoryFilter: { categoryId: string; treatedAsOther: boolean },
    drops: CategoryFetchTraceDrop[],
    summaryThreadIds: string[],
  ): void {
    const { categoryId, treatedAsOther } = categoryFilter;
    const keptIds = new Set(kept.map((emailItem) => emailItem.threadId));
    const summarySet = new Set(summaryThreadIds);
    for (const emailEntry of decrypted) {
      if (keptIds.has(emailEntry.threadId)) continue;
      if (!summarySet.has(emailEntry.threadId)) continue;
      drops.push({
        threadId: emailEntry.threadId,
        stage: "category_filter",
        reason: this.explainCategoryFilterDrop(
          emailEntry,
          categoryId,
          treatedAsOther,
        ),
      });
    }
  }

  private async applyBlockedFilter(
    userId: string,
    emails: InboxEmail[],
    drops: CategoryFetchTraceDrop[],
  ): Promise<InboxEmail[]> {
    const blockedEmailIds =
      await this.blockedSendersService.filterBlockedEmails(
        userId,
        emails.map((emailItem) => ({
          id: emailItem.id,
          from: emailItem.from,
        })),
      );
    const blockedSet = new Set(blockedEmailIds);
    return emails.filter((emailItem) => {
      if (!blockedSet.has(emailItem.id)) return true;
      drops.push({
        threadId: emailItem.threadId,
        stage: "blocked_sender",
        reason: `Sender '${emailItem.from}' is on the user's blocked-senders list`,
      });
      return false;
    });
  }

  private async applyModeFilter(
    userId: string,
    mode: CategoryFetchTraceMode,
    afterBlockedFilter: InboxEmail[],
    drops: CategoryFetchTraceDrop[],
  ): Promise<InboxEmail[]> {
    if (mode !== INBOX_MODES.ACTION && mode !== INBOX_MODES.FOLLOW_UP) {
      return afterBlockedFilter;
    }
    const tracker = new PerformanceTracker(`trace(${mode})`);
    const before = new Set(
      afterBlockedFilter.map((emailItem) => emailItem.threadId),
    );
    const after =
      mode === INBOX_MODES.ACTION
        ? await this.emailFollowUpService.filterActionModeEmails(
            userId,
            afterBlockedFilter,
            tracker,
          )
        : await this.emailFollowUpService.filterFollowUpModeEmails(
            userId,
            afterBlockedFilter,
            tracker,
          );
    const kept = new Set(after.map((emailItem) => emailItem.threadId));
    const userEmail =
      mode === INBOX_MODES.ACTION
        ? await this.resolveUserEmailLower(userId)
        : null;
    for (const threadId of before) {
      if (kept.has(threadId)) continue;
      drops.push(this.makeModeDrop(threadId, mode, userEmail));
    }
    return after;
  }

  private makeModeDrop(
    threadId: string,
    mode: CategoryFetchTraceMode,
    userEmail: string | null,
  ): CategoryFetchTraceDrop {
    if (mode === INBOX_MODES.ACTION) {
      return {
        threadId,
        stage: "action_mode_user_sent_last",
        reason: `Action mode drops threads where the user sent the latest message${userEmail ? ` (matching '${userEmail}')` : ""}`,
      };
    }
    return {
      threadId,
      stage: "follow_up_mode_no_reply_pending",
      reason:
        "Follow-up mode requires user to have sent the last reply AND the recipient not yet to have replied",
    };
  }

  private buildTrace(args: {
    categoryId: string;
    categoryName: string;
    mode: CategoryFetchTraceMode;
    treatedAsOther: boolean;
    requestedUuids: Set<string>;
    summaryThreadIds: string[];
    rawQueryAllThreadIds: string[];
    rawQueryCategoryEmails: InboxEmail[];
    afterBlockedFilter: InboxEmail[];
    afterModeFilter: InboxEmail[];
    drops: CategoryFetchTraceDrop[];
    driftMs: number;
    summaryThreadDetails: CategoryFetchTraceThreadDetail[];
  }): CategoryFetchTrace {
    const rawQueryCategoryThreadIds = args.rawQueryCategoryEmails.map(
      (emailItem) => emailItem.threadId,
    );
    const summarySet = new Set(args.summaryThreadIds);
    const rawAllSet = new Set(args.rawQueryAllThreadIds);
    return {
      categoryId: args.treatedAsOther ? null : args.categoryId,
      categoryName: args.categoryName,
      mode: args.mode,
      resolvedCategoryUuids: Array.from(args.requestedUuids),
      treatedAsOther: args.treatedAsOther,
      summaryThreadIds: args.summaryThreadIds,
      rawQueryAllThreadIds: args.rawQueryAllThreadIds,
      rawQueryCategoryThreadIds,
      afterBlockedFilterThreadIds: args.afterBlockedFilter.map(
        (emailItem) => emailItem.threadId,
      ),
      afterCategoryFilterThreadIds: rawQueryCategoryThreadIds,
      afterModeFilterThreadIds: args.afterModeFilter.map(
        (emailItem) => emailItem.threadId,
      ),
      drops: args.drops,
      summaryOnlyThreadIds: args.summaryThreadIds.filter(
        (threadId) => !rawAllSet.has(threadId),
      ),
      rawOnlyThreadIds: rawQueryCategoryThreadIds.filter(
        (threadId) => !summarySet.has(threadId),
      ),
      summaryToRawDriftMs: args.driftMs,
      summaryThreadDetails: args.summaryThreadDetails,
    };
  }

  private explainCategoryFilterDrop(
    emailEntry: InboxEmail,
    requestedCategoryId: string,
    treatedAsOther: boolean,
  ): string {
    const isOtherThread =
      !emailEntry.categoryId ||
      emailEntry.category === INBOX_OTHER_CATEGORY_NAME;
    if (treatedAsOther && !isOtherThread) {
      return `Thread has categoryId='${emailEntry.categoryId ?? "null"}' (category='${emailEntry.category ?? "(none)"}'); requested 'Other' bucket only contains null-category threads`;
    }
    if (!treatedAsOther && isOtherThread) {
      return `Thread has no categoryId (or resolved to 'Other'); requested category UUID '${requestedCategoryId}' does not match`;
    }
    if (!treatedAsOther && emailEntry.categoryId !== requestedCategoryId) {
      return `Thread categoryId='${emailEntry.categoryId}' does not match requested '${requestedCategoryId}' — likely stale UUID after category rename/recreate`;
    }
    return "Thread fell outside the requested category bucket";
  }

  private async resolveUserEmailLower(userId: string): Promise<string | null> {
    try {
      const user = await this.usersService.findOne(userId);
      if (!user) return null;
      return EncryptionHelper.tryDecrypt(user.email)?.toLowerCase() ?? null;
    } catch (error) {
      this.logger.warn(`Failed to resolve user email for trace: ${error}`);
      return null;
    }
  }
}
