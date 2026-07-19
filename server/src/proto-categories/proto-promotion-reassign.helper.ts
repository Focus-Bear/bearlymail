import { Repository } from "typeorm";

import { EmailThread } from "../database/entities/email-thread.entity";
import { updateThreadCategoryWithPrecedence } from "../emails/category-precedence.helper";
import { buildProtoPromotionTrace } from "./proto-promotion-trace.helper";

/**
 * Bulk-reassigns a promoted proto-category's threads to the target category
 * through the precedence guard: promotion is the lowest-rank writer, so it only
 * fills threads that carry no category decision at all (categorySource null),
 * and it keeps categorySource null so the thread stays freely recategorisable.
 * Threads the guard skips keep their pinned category and are then detached from
 * the proto so they don't hold a dangling reference.
 */
export async function reassignPromotedProtoThreads(
  repository: Repository<EmailThread>,
  args: {
    protoCategoryId: string;
    targetCategoryId: string;
    targetCategoryName: string;
    categoryExplanation: string;
    traceDetail: string;
    promotedAt: Date;
  },
): Promise<void> {
  await updateThreadCategoryWithPrecedence(repository, {
    where: { protoCategoryId: args.protoCategoryId },
    source: "proto",
    set: {
      categoryId: args.targetCategoryId,
      categoryExplanation: args.categoryExplanation,
      protoCategoryId: null,
      categorySource: null,
      categoryDecisionTrace: buildProtoPromotionTrace(
        args.targetCategoryName,
        args.targetCategoryId,
        args.traceDetail,
        args.promotedAt,
      ),
    },
  });
  await repository.update(
    { protoCategoryId: args.protoCategoryId },
    { protoCategoryId: null },
  );
}
