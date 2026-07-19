import { Logger } from "@nestjs/common";

import type { ProtoCategoriesService } from "../proto-categories/proto-categories.service";

/**
 * Routes an email to a proto category when the LLM returned a *proto*-category's name directly
 * (the defensive fuzzy-match path). If assigning tips the proto over the promotion threshold it is
 * promoted and its real category returned; otherwise the thread is parked in "Other" under the
 * proto. Returns null when there's no match or on error (logged, non-fatal).
 */
export async function applyDirectProtoMatch(
  deps: { protoCategoriesService: ProtoCategoriesService; logger: Logger },
  options: {
    categoryName: string;
    emailThreadId: string;
    userId: string;
    workerId: string;
    lookupCategoryContextId: (name: string | null) => string | null;
  },
): Promise<{
  finalCategory: string | null;
  categoryId: string | null;
  protoCategoryId: string | null;
} | null> {
  const { protoCategoriesService, logger } = deps;
  const {
    categoryName,
    emailThreadId,
    userId,
    workerId,
    lookupCategoryContextId,
  } = options;
  try {
    const directProtoMatch =
      await protoCategoriesService.findMatchingProtoCategory(
        userId,
        categoryName,
      );
    if (!directProtoMatch) return null;
    const updatedProto =
      await protoCategoriesService.assignThreadToProtoCategory(
        directProtoMatch.id,
        emailThreadId,
      );
    logger.log(
      `[Worker ${workerId}] Batch: LLM returned proto-category name directly: "${categoryName}" — re-routed`,
    );
    if (updatedProto.isPromoted) {
      const resolvedCategory = updatedProto.name;
      return {
        finalCategory: resolvedCategory,
        categoryId: lookupCategoryContextId(resolvedCategory),
        protoCategoryId: null,
      };
    }
    return {
      finalCategory: "Other",
      categoryId: null,
      protoCategoryId: updatedProto.id,
    };
  } catch (err) {
    logger.warn(
      `[Worker ${workerId}] Batch: Failed defensive proto-category check for "${categoryName}":`,
      err,
    );
    return null;
  }
}
