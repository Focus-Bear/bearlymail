import { Injectable, Logger } from "@nestjs/common";

import { BlockedSendersService } from "../blocked-senders/blocked-senders.service";
import { INBOX_MODES } from "../constants/query-limits";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { UsersService } from "../users/users.service";
import { parseCategoryName } from "../utils/category-name.util";
import { threadHasBlockedLabel } from "./email-inbox.types";

/** Display name used for the null-category (uncategorized) bucket; inbox summary uses id: null. */
export const INBOX_OTHER_CATEGORY_NAME = "Other";

/** Key the client sends for the null-category (uncategorized) bucket. */
export const INBOX_UNCATEGORIZED_CATEGORY_KEY = "uncategorized";

/**
 * Category-counting and filtering helpers extracted from EmailInboxService.
 * Handles row filtering, category bucketing (with priority sort), and
 * category-ID resolution for inbox summaries.
 *
 * Extracted to keep EmailInboxService under the 800-line limit.
 */
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
    row: { latestFrom?: string; allLabels?: string[] | null },
    needsUserSentLastFilter: boolean,
    userEmailLower: string | null,
  ): Promise<boolean> {
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
    if (needsUserSentLastFilter && userEmailLower && row.latestFrom) {
      try {
        const fromLower =
          EncryptionHelper.tryDecrypt(row.latestFrom)?.toLowerCase() || "";
        const userSentLast = fromLower.includes(userEmailLower);
        if (mode === INBOX_MODES.ACTION && userSentLast) return true;
        if (mode === INBOX_MODES.FOLLOW_UP && !userSentLast) return true;
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
    }[];
    includeThreadIds: boolean;
    needsUserSentLastFilter: boolean;
    userEmailLower: string | null;
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
    } = options;
    const categoryOrder: string[] = [];
    const categoryCounts: Record<string, number> = {};
    const categoryThreadIds: Record<string, string[]> = {};
    const categoryUuidByName = new Map<string, string>();
    const categoryMaxPriority: Record<string, number> = {};

    for (const row of rows) {
      if (
        await this.shouldSkipSummaryRow(
          userId,
          mode,
          row,
          needsUserSentLastFilter,
          userEmailLower,
        )
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
      let category: string;
      if (row.categoryId != null && decryptedCategoryName != null) {
        category = parseCategoryName(decryptedCategoryName);
      } else {
        category = INBOX_OTHER_CATEGORY_NAME;
      }
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

    return {
      categoryOrder,
      categoryCounts,
      categoryThreadIds,
      categoryUuidByName,
    };
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
    const requestedOther =
      categoryIds.includes(INBOX_OTHER_CATEGORY_NAME) ||
      categoryIds.includes(INBOX_UNCATEGORIZED_CATEGORY_KEY);
    const realIds = categoryIds.filter(
      (id) =>
        id !== INBOX_OTHER_CATEGORY_NAME &&
        id !== INBOX_UNCATEGORIZED_CATEGORY_KEY,
    );
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
      const uuid = categoryUuidByName.get(cat);
      if (uuid) return requestedUuids.has(uuid);
      return namesFromIds.has(cat);
    });
  }
}
