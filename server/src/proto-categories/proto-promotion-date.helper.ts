import { In, Repository } from "typeorm";

import {
  ConsideredDuplicateCandidate,
  ProtoCategory,
} from "../database/entities/proto-category.entity";
import { UserContext } from "../database/entities/user-context.entity";

export interface PromotedCategoryInfo {
  promotedCategoryId: string;
  name: string;
  promotedAt: Date | null;
  promotionReasoning: string | null;
  duplicateCandidates: ConsideredDuplicateCandidate[];
}

/**
 * `promotedAt` was added later (migration 1794300000000), so proto categories promoted
 * before it existed have a null timestamp. The live category was created at promotion,
 * so its `createdAt` is the accurate "promoted on" date — fetch it for those rows,
 * keyed by the live category's contextId.
 *
 * Cost: this runs only when some promoted row still has a null `promotedAt`, and is a
 * single bounded `contextId IN (...)` lookup on the primary key. Permanently orphaned
 * rows (live category deleted) won't be found and fall back to the proto's own
 * `createdAt`, but they keep re-triggering this indexed query on each read — acceptable
 * given the small, shrinking set of pre-migration rows.
 */
async function fetchFallbackPromotionDates(
  promoted: ProtoCategory[],
  userContextRepository: Repository<UserContext>,
): Promise<Map<string, Date>> {
  const ids = promoted
    .filter((proto) => proto.promotedCategoryId && !proto.promotedAt)
    .map((proto) => proto.promotedCategoryId as string);
  if (ids.length === 0) {
    return new Map();
  }
  const live = await userContextRepository.find({
    where: { contextId: In(ids) },
    select: { contextId: true, createdAt: true },
  });
  return new Map(live.map((ctx) => [ctx.contextId, ctx.createdAt]));
}

/**
 * Build the promotion metadata the categories UI shows, keyed by the live category's
 * contextId — backfilling a "promoted on" date for rows whose `promotedAt` is null.
 */
export async function buildPromotedCategoryInfos(
  promoted: ProtoCategory[],
  userContextRepository: Repository<UserContext>,
): Promise<PromotedCategoryInfo[]> {
  const liveCreatedAt = await fetchFallbackPromotionDates(
    promoted,
    userContextRepository,
  );
  // Re-sort after backfilling: the DB query orders by `promotedAt DESC`, which puts
  // null (pre-migration) rows FIRST under Postgres' NULLS FIRST default. Once we fill
  // their dates in memory they'd otherwise stay pinned to the top, so sort by the
  // resolved date (newest first) to get the correct chronological order.
  return promoted
    .filter((proto) => proto.promotedCategoryId)
    .map((proto) => ({
      promotedCategoryId: proto.promotedCategoryId as string,
      name: proto.name,
      promotedAt:
        proto.promotedAt ??
        liveCreatedAt.get(proto.promotedCategoryId as string) ??
        proto.createdAt,
      promotionReasoning: proto.promotionReasoning,
      duplicateCandidates: proto.duplicateCandidates ?? [],
    }))
    .sort(
      (lhs, rhs) =>
        (rhs.promotedAt?.getTime() ?? 0) - (lhs.promotedAt?.getTime() ?? 0),
    );
}
