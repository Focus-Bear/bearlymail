import { Repository } from "typeorm";

import { EmailThread } from "../database/entities/email-thread.entity";
import {
  CategoryWriterSource,
  updateThreadCategoryWithPrecedence,
} from "../emails/category-precedence.helper";
import { buildProtoPromotionTrace } from "./proto-promotion-trace.helper";

/**
 * Bulk-reassigns a promoted proto-category's threads to the target category
 * through the precedence guard, keeping categorySource null so the thread stays
 * freely recategorisable. Threads the guard skips keep their pinned category and
 * are then detached from the proto so they don't hold a dangling reference.
 *
 * `source` controls how much the reassign may override:
 * - Background auto-promotion uses `'proto'` (lowest): only fills threads with
 *   no category decision at all.
 * - A user clicking "Convert to category" is a deliberate action, so it uses a
 *   higher source (`'priority'`) to also move the automated `'priority'`/`'local'`
 *   "Other" emails the proto grouped — the whole point of the button — while
 *   still leaving explicit `'user'`/`'rule'` categories untouched.
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
    source?: CategoryWriterSource;
  },
): Promise<void> {
  await updateThreadCategoryWithPrecedence(repository, {
    where: { protoCategoryId: args.protoCategoryId },
    source: args.source ?? "proto",
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
