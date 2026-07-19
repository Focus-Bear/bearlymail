import { Repository } from "typeorm";
import { QueryDeepPartialEntity } from "typeorm/query-builder/QueryPartialEntity";

import { EmailThread } from "../database/entities/email-thread.entity";

/**
 * Who is writing the category. Every writer of `EmailThread.categoryId` must
 * declare itself so the precedence guard can decide whether the write is
 * allowed to replace what a previous writer decided.
 */
export type CategoryWriterSource =
  | "user"
  | "rule"
  | "local"
  | "priority"
  | "proto";

/**
 * The authoritative, user-set category source. It is top-ranked in the
 * precedence guard and represents a deliberate manual choice (including a
 * deliberate move to "Other"), so automation must never overwrite or re-derive
 * it.
 */
export const USER_CATEGORY_SOURCE = "user";

/** `categorySource` written by the local model (priority applied without an LLM). */
export const LOCAL_CATEGORY_SOURCE = "local";

/**
 * Precedence of `categorySource` values. A writer may only overwrite a stored
 * source of EQUAL or LOWER rank (a null stored source is always writable).
 *
 * - `user` — manual override; nothing automated may move it.
 * - `rule` — deterministic category rule; only the user or another rule pass
 *   may move it (the refine pipeline re-consults rules first on every run, so
 *   a still-matching rule keeps winning; the LLM alone can no longer drift it).
 * - `local` / `priority` — automated per-run decisions (local model / LLM).
 *   Equal rank: each fresh refine run may replace the previous automated pick,
 *   whichever engine produced it.
 * - `summary` — legacy value from the removed summary categoriser (#2549);
 *   any current writer may replace it.
 * - `proto` — proto-category promotion bulk reassign. Lowest: it may only fill
 *   threads that carry no decision at all (stored source stays null so the
 *   thread remains freely recategorisable).
 */
const CATEGORY_SOURCE_RANK: Record<string, number> = {
  user: 50,
  rule: 40,
  local: 20,
  priority: 20,
  summary: 10,
  proto: 1,
};

export function categorySourceRank(source: string | null | undefined): number {
  if (!source) return 0;
  return CATEGORY_SOURCE_RANK[source] ?? 0;
}

/**
 * The stored `categorySource` values a writer may overwrite (null is always
 * overwritable and is handled separately in the SQL guard).
 */
export function overridableCategorySources(
  source: CategoryWriterSource,
): string[] {
  const rank = categorySourceRank(source);
  return Object.keys(CATEGORY_SOURCE_RANK).filter(
    (value) => CATEGORY_SOURCE_RANK[value] <= rank,
  );
}

/**
 * Applies category columns to threads WITH the precedence guard: the UPDATE
 * only touches rows whose current `categorySource` is null or outranked by
 * `source`. This is the single choke-point every automated category writer
 * must go through (the user override writes directly — the user always wins).
 *
 * `where` is an equality filter (e.g. `{ id }` for one thread or
 * `{ protoCategoryId }` for a promotion's bulk reassign); `whereIdIn` targets
 * an explicit thread-id list (e.g. a rule's retroactive application). Returns
 * the number of rows actually updated so callers can log blocked writes.
 */
export async function updateThreadCategoryWithPrecedence(
  repository: Repository<EmailThread>,
  options: {
    where?: Partial<Record<keyof EmailThread, string>>;
    whereIdIn?: string[];
    source: CategoryWriterSource;
    set: QueryDeepPartialEntity<EmailThread>;
  },
): Promise<number> {
  const { where = {}, whereIdIn, source, set } = options;
  // An explicitly-provided empty id list means "update nothing" — skipping the
  // IN clause instead would widen the update to everything matching `where`.
  if (whereIdIn !== undefined && whereIdIn.length === 0) {
    return 0;
  }
  // An empty filter would make the precedence guard the ONLY condition —
  // an accidental near-table-wide update. Refuse loudly instead.
  if (Object.keys(where).length === 0 && !whereIdIn?.length) {
    throw new Error(
      "updateThreadCategoryWithPrecedence: 'where' criteria cannot be empty",
    );
  }
  const builder = repository.createQueryBuilder().update(EmailThread).set(set);

  for (const [column, value] of Object.entries(where)) {
    builder.andWhere(`"${column}" = :where_${column}`, {
      [`where_${column}`]: value,
    });
  }
  if (whereIdIn?.length) {
    builder.andWhere('"id" IN (:...whereIdIn)', { whereIdIn });
  }

  builder.andWhere(
    '("categorySource" IS NULL OR "categorySource" IN (:...overridableSources))',
    { overridableSources: overridableCategorySources(source) },
  );

  const result = await builder.execute();
  return result.affected ?? 0;
}
