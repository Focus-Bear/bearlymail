import { Injectable, Logger } from "@nestjs/common";

import { BlockedSendersService } from "../blocked-senders/blocked-senders.service";
import { INBOX_MODES } from "../constants/query-limits";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { UsersService } from "../users/users.service";
import { parseCategoryName } from "../utils/category-name.util";
import {
  INBOX_OTHER_CATEGORY_NAME,
  INBOX_PENDING_CATEGORY_KEY,
  INBOX_PENDING_CATEGORY_NAME,
  INBOX_UNCATEGORIZED_CATEGORY_KEY,
  isOtherCategoryKey,
  isSentinelCategoryKey,
  isThreadCategoryPending,
  threadHasBlockedLabel,
} from "./email-inbox.types";
import { shouldKeepInActionMode } from "./email-inbox-scope.helpers";

// Re-exported from email-inbox.types (their dependency-free home) so existing
// importers of these sentinels via this service keep working unchanged.
export { INBOX_OTHER_CATEGORY_NAME, INBOX_UNCATEGORIZED_CATEGORY_KEY };

/**
 * Category-counting and filtering helpers extracted from EmailInboxService.
 * Handles row filtering, category bucketing (with priority sort), and
 * category-ID resolution for inbox summaries.
 *
 * Extracted to keep EmailInboxService under the 800-line limit.
 */
/** Inputs the per-row mode rules need: action-mode sender check, follow-up membership. */
export interface SummaryModeRules {
  needsUserSentLastFilter: boolean;
  userEmailLower: string | null;
  /** Threads the shared follow-up rule accepted; required in follow-up mode. */
  followUpThreadIds?: Set<string>;
}

@Injectable()
export class EmailInboxCategoryService {
  private readonly logger = new Logger(EmailInboxCategoryService.name);

  constructor(
    private blockedSendersService: BlockedSendersService,
    private usersService: UsersService,
  ) {}

  async resolveUserEmailLower(
    userId: string,
    needsFilter: boolean,
  ): Promise<string | null> {
    if (!needsFilter) return null;
    try {
      const user = await this.usersService.findOne(userId);
      if (user)
        return EncryptionHelper.tryDecrypt(user.email)?.toLowerCase() || null;
    } catch (error) {
      this.logger.warn(
        "Failed to get user email for summary sent-last filter:",
        error,
      );
    }
    return null;
  }

  async shouldSkipSummaryRow(
    userId: string,
    mode: string,
    row: {
      threadId?: string;
      latestFrom?: string;
      allLabels?: string[] | null;
      sentByAutoResponder?: boolean | null;
      keepInAction?: boolean | null;
    },
    modeRules: SummaryModeRules,
  ): Promise<boolean> {
    const { needsUserSentLastFilter, userEmailLower, followUpThreadIds } =
      modeRules;
    if (mode === INBOX_MODES.BLOCKED) {
      // Use threadHasBlockedLabel to check all emails in the thread (not just the latest).
      return !threadHasBlockedLabel(row.allLabels);
    }
    if (mode !== INBOX_MODES.BLOCKED && row.latestFrom) {
      let fromEmail = "";
      try {
        fromEmail = EncryptionHelper.tryDecrypt(row.latestFrom) || "";
      } catch {
        /* include on error */
      }
      if (
        fromEmail &&
        (await this.blockedSendersService.isSenderBlocked(userId, fromEmail))
      )
        return true;
    }
    if (mode === INBOX_MODES.FOLLOW_UP && followUpThreadIds) {
      // Same decision the list makes (issue #2062): membership comes from the
      // follow-up evaluation, not from who sent the latest message.
      return !row.threadId || !followUpThreadIds.has(row.threadId);
    }
    if (
      mode === INBOX_MODES.ACTION &&
      needsUserSentLastFilter &&
      userEmailLower &&
      row.latestFrom
    ) {
      try {
        const from = EncryptionHelper.tryDecrypt(row.latestFrom) || "";
        return !shouldKeepInActionMode(
          {
            from,
            sentByAutoResponder: row.sentByAutoResponder,
            keepInAction: row.keepInAction,
          },
          userEmailLower,
        );
      } catch {
        /* include on error */
      }
    }
    return false;
  }

  async countRowsByCategory(options: {
    userId: string;
    mode: string;
    rows: {
      categoryName: string | null;
      categoryId: string | null;
      threadId?: string;
      latestFrom?: string;
      allLabels?: string[] | null;
      priorityScore?: number | null;
      isProcessingPriority?: boolean | null;
      sentByAutoResponder?: boolean | null;
      keepInAction?: boolean | null;
    }[];
    includeThreadIds: boolean;
    needsUserSentLastFilter: boolean;
    userEmailLower: string | null;
    /** Threads the shared follow-up rule accepted (follow-up mode only). */
    followUpThreadIds?: Set<string>;
  }): Promise<{
    categoryOrder: string[];
    categoryCounts: Record<string, number>;
    categoryThreadIds: Record<string, string[]>;
    categoryUuidByName: Map<string, string>;
  }> {
    const {
      userId,
      mode,
      rows,
      includeThreadIds,
      needsUserSentLastFilter,
      userEmailLower,
      followUpThreadIds,
    } = options;
    const categoryOrder: string[] = [];
    const categoryCounts: Record<string, number> = {};
    const categoryThreadIds: Record<string, string[]> = {};
    const categoryUuidByName = new Map<string, string>();
    const categoryMaxPriority: Record<string, number> = {};

    for (const row of rows) {
      if (
        await this.shouldSkipSummaryRow(userId, mode, row, {
          needsUserSentLastFilter,
          userEmailLower,
          followUpThreadIds,
        })
      )
        continue;

      // categoryName comes from a raw SQL query — TypeORM's encryptedColumnTransformer does NOT
      // run for raw .query() results, so contextValue is returned as encrypted ciphertext.
      // tryDecrypt returns raw ciphertext on failure; treat that as "no usable name" so we bucket
      // to Other and never attach a UUID to the Other label (orphan categoryId + missing name).
      const rawResolved = row.categoryName
        ? EncryptionHelper.tryDecrypt(row.categoryName)
        : null;
      const decryptedCategoryName =
        rawResolved && !EncryptionHelper.looksLikeEncryptedPayload(rawResolved)
          ? rawResolved
          : null;
      const category = this.resolveSummaryBucket(row, decryptedCategoryName);
      const threadPriority = row.priorityScore ?? 0;
      if (!categoryOrder.includes(category)) {
        categoryOrder.push(category);
        categoryThreadIds[category] = [];
        categoryMaxPriority[category] = threadPriority;
      } else {
        categoryMaxPriority[category] = Math.max(
          categoryMaxPriority[category],
          threadPriority,
        );
      }
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
      if (row.threadId && includeThreadIds)
        categoryThreadIds[category].push(row.threadId);
      if (
        row.categoryId != null &&
        decryptedCategoryName != null &&
        !categoryUuidByName.has(category)
      ) {
        categoryUuidByName.set(category, row.categoryId);
      }
    }

    // Sort categories by their max thread priority descending so that high-priority
    // categories always appear first, regardless of SQL row insertion order.
    // This prevents low-priority categories (e.g. Newsletters, max priority -1)
    // from appearing above higher-priority ones in the action tab (fix #1550).
    categoryOrder.sort(
      (catA, catB) =>
        (categoryMaxPriority[catB] ?? 0) - (categoryMaxPriority[catA] ?? 0),
    );
    pinPendingBucketFirst(categoryOrder);

    return {
      categoryOrder,
      categoryCounts,
      categoryThreadIds,
      categoryUuidByName,
    };
  }

  /**
   * Bucket name for a summary row: its category name when resolved, the
   * pending bucket while categorisation is still running, otherwise "Other".
   */
  private resolveSummaryBucket(
    row: { categoryId: string | null; isProcessingPriority?: boolean | null },
    decryptedCategoryName: string | null,
  ): string {
    const hasResolvedCategory =
      row.categoryId != null && decryptedCategoryName != null;
    if (hasResolvedCategory) return parseCategoryName(decryptedCategoryName);
    const isPending = isThreadCategoryPending({
      hasResolvedCategory,
      isProcessingPriority: row.isProcessingPriority,
    });
    return isPending ? INBOX_PENDING_CATEGORY_NAME : INBOX_OTHER_CATEGORY_NAME;
  }

  filterVisibleCategoriesByIds(
    userId: string,
    categoryOrder: string[],
    categoryUuidByName: Map<string, string>,
    categoryNameToId: Map<string, string>,
    categoryIds?: string[],
  ): string[] | null {
    if (!categoryIds || categoryIds.length === 0) return categoryOrder;

    // Client sends "uncategorized" for the null-category bucket; treat as synonym for "Other".
    const requestedOther = categoryIds.some(isOtherCategoryKey);
    // Pending threads used to be counted under Other, so an Other filter keeps them.
    const requestedPending =
      requestedOther || categoryIds.includes(INBOX_PENDING_CATEGORY_KEY);
    const realIds = categoryIds.filter((id) => !isSentinelCategoryKey(id));
    const requestedUuids = new Set(realIds);
    const idToName = new Map<string, string>();
    categoryNameToId.forEach((id, name) => idToName.set(id, name));
    const namesFromIds = new Set(
      realIds
        .map((id) => idToName.get(id))
        .filter((name): name is string => name !== undefined),
    );

    if (realIds.length > 0 && namesFromIds.size === 0) {
      this.logger.warn(
        `getInboxSummary: none of the requested UUIDs resolved to a known category (userId=${userId})`,
      );
      return null;
    }

    return categoryOrder.filter((cat) => {
      if (requestedOther && cat === INBOX_OTHER_CATEGORY_NAME) return true;
      if (cat === INBOX_PENDING_CATEGORY_NAME) return requestedPending;
      const uuid = categoryUuidByName.get(cat);
      if (uuid) return requestedUuids.has(uuid);
      return namesFromIds.has(cat);
    });
  }
}

/** The pending bucket always leads the list so new mail being sorted is visible first. */
function pinPendingBucketFirst(categoryOrder: string[]): void {
  const pendingIndex = categoryOrder.indexOf(INBOX_PENDING_CATEGORY_NAME);
  if (pendingIndex <= 0) return;
  categoryOrder.splice(pendingIndex, 1);
  categoryOrder.unshift(INBOX_PENDING_CATEGORY_NAME);
}
