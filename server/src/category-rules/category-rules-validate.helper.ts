/**
 * Issue #1789: helpers that validate a draft composite rule against the user's
 * recent thread history before it is auto-persisted. Extracted from
 * `category-rules.service.ts` so the service stays under the 800-line lint cap.
 */
import { BadRequestException, Logger } from "@nestjs/common";
import { Repository } from "typeorm";

import { CATEGORY_RULE_COMPOSITE } from "../constants/category-rule-composite.constants";
import {
  CategoryRule,
  CompositeCategoryRuleSpec,
} from "../database/entities/category-rule.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import {
  ContextKey,
  UserContext,
} from "../database/entities/user-context.entity";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { buildRuleMatchText } from "../llm/email-content-cleaner";
import { parseCategoryName } from "../utils/category-name.util";
import { evaluateComposite } from "./category-rules-auto-composite.helper";

export interface ValidateCompositeRuleResult {
  passes: boolean;
  truePositives: number;
  falsePositives: number;
}

/**
 * Returns the contextId of the EMAIL_CATEGORY UserContext row whose category
 * name matches `categoryName` (case-insensitive). Null when no match.
 *
 * `contextValue` is stored in the `"Name - Description"` format, so we compare
 * against the parsed name only — comparing the whole value would never match a
 * rule's bare `categoryName` and would mark every described category's rule as
 * "broken" (the reverse lookup `resolveCategoryName` already parses the name,
 * so this keeps the two directions symmetric).
 */
/**
 * Normalise a category name for tolerant matching: lowercase and strip a leading
 * emoji/symbol prefix, so "🎧 Media & Communications" and "Media & Communications"
 * resolve to the same key. Only used for name-based fallback matching (backfill,
 * legacy rules, LLM suggestions) — the primary path stores the category UUID.
 */
export function normaliseCategoryNameForMatch(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .trim();
}

export async function findCategoryContextIdByName(
  userContextRepository: Repository<UserContext>,
  userId: string,
  categoryName: string,
): Promise<string | null> {
  const normalised = normaliseCategoryNameForMatch(categoryName);
  if (!normalised) return null;
  const byName = await buildCategoryNameToContextIdMap(
    userContextRepository,
    userId,
  );
  return byName.get(normalised) ?? null;
}

/**
 * Builds a lookup of parsed category name (lowercased) → contextId for all of a
 * user's EMAIL_CATEGORY contexts. Lets callers resolve many rule names from a
 * single query instead of one {@link findCategoryContextIdByName} call each.
 *
 * Keyed on the parsed name (the `"Name - Description"` value's name portion) so
 * a rule's bare `categoryName` matches. On duplicate names the first context
 * wins (stable with the previous `.find` behaviour).
 */
export async function buildCategoryNameToContextIdMap(
  userContextRepository: Repository<UserContext>,
  userId: string,
): Promise<Map<string, string>> {
  const contexts = await userContextRepository.find({
    where: { userId, contextKey: ContextKey.EMAIL_CATEGORY },
    select: {
      contextId: true,
      contextValue: true,
    },
  });
  const byName = new Map<string, string>();
  for (const ctx of contexts) {
    if (!ctx.contextValue) continue;
    const key = normaliseCategoryNameForMatch(
      parseCategoryName(ctx.contextValue),
    );
    if (key && !byName.has(key)) byName.set(key, ctx.contextId);
  }
  return byName;
}

/**
 * Self-heals rules whose `categoryId` link is null — created before the
 * categoryId FK existed, or null'd by the old whole-value name matcher that
 * compared a rule's bare name against the `"Name - Description"` context value.
 * The settings UI flags these as "broken", so rather than require the manual
 * admin backfill we re-resolve them by name and persist any matches. Mutates the
 * passed `rules` in place so the caller can return the healed values. Persistence
 * is best-effort and never throws (it runs inside the read path); pass a `logger`
 * to record how many links were healed (or a write failure).
 *
 * A single context fetch resolves all broken rules, and the early return means
 * a list with no broken rules costs nothing. Rules whose category was genuinely
 * deleted stay null (still broken) — those remain "broken", so a user with a
 * persistently-orphaned rule incurs that one indexed context query on every
 * list (no writes, since nothing resolves). That cost is bounded and small.
 */
export async function healBrokenCategoryLinks(
  categoryRuleRepository: Repository<CategoryRule>,
  userContextRepository: Repository<UserContext>,
  userId: string,
  rules: CategoryRule[],
  logger?: Logger,
): Promise<void> {
  const broken = rules.filter((rule) => !rule.categoryId);
  if (broken.length === 0) return;

  const nameToId = await buildCategoryNameToContextIdMap(
    userContextRepository,
    userId,
  );
  if (nameToId.size === 0) return;

  const healed: Array<{ id: string; categoryId: string }> = [];
  for (const rule of broken) {
    const categoryId = nameToId.get(rule.categoryName.trim().toLowerCase());
    if (categoryId) {
      rule.categoryId = categoryId;
      healed.push({ id: rule.id, categoryId });
    }
  }
  if (healed.length === 0) return;

  // Best-effort persistence: this runs inside the read path (listRules), so a
  // transient write failure must degrade gracefully rather than break the list.
  // The in-memory categoryId is still returned to the caller; the next list
  // re-attempts any rows that did not persist.
  try {
    await Promise.all(
      healed.map(({ id, categoryId }) =>
        categoryRuleRepository.update({ id, userId }, { categoryId }),
      ),
    );
    logger?.log(
      `[CategoryRules] Auto-healed ${healed.length} broken category link(s) for user ${userId}`,
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logger?.warn(
      `[CategoryRules] Auto-heal write failed for ${userId}: ${reason}`,
    );
  }
}

/**
 * Resolves the `(categoryId, categoryName)` pair to persist on a rule.
 *
 * Prefers an explicit `categoryId` from the client — the settings editor sends
 * the chosen category's UUID, so we validate it belongs to the user as an
 * EMAIL_CATEGORY and derive the canonical name *from that context*. This makes a
 * broken link impossible for the editor path: the id is authoritative and the
 * stored name can never drift from it.
 *
 * Falls back to name-based resolution only when no id is supplied — the
 * LLM-suggested/auto-generated paths only know category names, not UUIDs.
 */
export async function resolveCategoryLink(
  userContextRepository: Repository<UserContext>,
  userId: string,
  input: { categoryId?: string | null; categoryName: string },
): Promise<{ categoryId: string | null; categoryName: string }> {
  const trimmedName = input.categoryName.trim();
  if (input.categoryId) {
    const ctx = await userContextRepository.findOne({
      where: {
        contextId: input.categoryId,
        userId,
        contextKey: ContextKey.EMAIL_CATEGORY,
      },
      select: { contextId: true, contextValue: true },
    });
    if (!ctx) {
      throw new BadRequestException(
        "categoryId does not match an existing category",
      );
    }
    return {
      categoryId: ctx.contextId,
      categoryName: parseCategoryName(ctx.contextValue),
    };
  }
  return {
    categoryId: await findCategoryContextIdByName(
      userContextRepository,
      userId,
      trimmedName,
    ),
    categoryName: trimmedName,
  };
}

/**
 * One row of the validation window: a single email plucked as the
 * representative for its thread, with the thread's categoryId attached so
 * we can label matches as TPs (target category) or FPs (other category).
 * Re-exported so the derive-exclusions flow can reuse the same shape.
 */
export interface ValidationRow {
  from: string;
  subject: string;
  body: string;
  htmlBody: string | null;
  categoryId: string | null;
}

/** A `ValidationRow` after `EncryptionHelper.decrypt` has been applied. */
export interface DecryptedValidationRow {
  from: string;
  subject: string;
  body: string;
  htmlBody: string | null;
  categoryId: string | null;
}

/**
 * Returns one representative email (the most recent) from each of the
 * AUTO_VALIDATE_THREAD_COUNT most recently-updated categorised threads.
 *
 * Why one-email-per-thread (issue #1789 review): a naïve `ORDER BY
 * email.receivedAt DESC LIMIT N` would sample *emails*, not *threads*, so a
 * single high-traffic thread could fill the entire validation window and
 * starve diversity. Picking one email per thread keeps the sample spread
 * across threads, which matches the intent of the constant name.
 *
 * Implementation: a CTE selects the N most-recently-updated categorised
 * threads, then `DISTINCT ON (emailThreadId)` paired with
 * `ORDER BY emailThreadId, receivedAt DESC` picks the most recent email
 * per thread. PostgreSQL-only — fine because the rest of the app already
 * targets PostgreSQL.
 */
export async function fetchRecentCategorisedEmailRows(
  emailThreadRepository: Repository<EmailThread>,
  userId: string,
): Promise<ValidationRow[]> {
  return emailThreadRepository.manager.query(
    `
    WITH recent_threads AS (
      SELECT id, "categoryId"
      FROM email_threads
      WHERE "userId" = $1 AND "categoryId" IS NOT NULL
      ORDER BY "updatedAt" DESC
      LIMIT $2
    )
    SELECT DISTINCT ON (e."emailThreadId")
      e."from"        AS "from",
      e.subject       AS subject,
      e.body          AS body,
      e."htmlBody"    AS "htmlBody",
      rt."categoryId" AS "categoryId"
    FROM recent_threads rt
    INNER JOIN emails e ON e."emailThreadId" = rt.id
    WHERE e."userId" = $1
    ORDER BY e."emailThreadId", e."receivedAt" DESC
    `,
    [userId, CATEGORY_RULE_COMPOSITE.AUTO_VALIDATE_THREAD_COUNT],
  );
}

export interface ValidateCompositeRuleParams {
  emailThreadRepository: Repository<EmailThread>;
  userContextRepository: Repository<UserContext>;
  normaliseSender: (raw: string) => string;
  userId: string;
  spec: CompositeCategoryRuleSpec;
  categoryName: string;
}

/** Decrypts a raw `ValidationRow` (TypeORM transformer is bypassed for raw queries). */
export function decryptValidationRow(
  row: ValidationRow,
): DecryptedValidationRow {
  return {
    from: EncryptionHelper.decrypt(row.from),
    subject: EncryptionHelper.decrypt(row.subject),
    body: EncryptionHelper.decrypt(row.body),
    htmlBody: row.htmlBody ? EncryptionHelper.decrypt(row.htmlBody) : null,
    categoryId: row.categoryId,
  };
}

export interface EvaluateSpecAgainstRowsResult {
  truePositiveRows: DecryptedValidationRow[];
  falsePositiveRows: DecryptedValidationRow[];
}

/**
 * Walks already-decrypted `ValidationRow`s and partitions matches into
 * TP/FP buckets relative to `targetCategoryId`. Used both by
 * `validateCompositeRuleAgainstHistory` (which only needs the counts) and
 * by the derive-exclusions flow (which needs the actual FP rows so it can
 * feed them to the LLM).
 */
export function partitionMatchesByCategory(
  rows: DecryptedValidationRow[],
  spec: CompositeCategoryRuleSpec,
  normaliseSender: (raw: string) => string,
  targetCategoryId: string | null,
): EvaluateSpecAgainstRowsResult {
  const truePositiveRows: DecryptedValidationRow[] = [];
  const falsePositiveRows: DecryptedValidationRow[] = [];
  for (const row of rows) {
    const evaluation = evaluateComposite(
      spec,
      {
        from: row.from,
        subject: row.subject,
        bodyTextForMatch: buildRuleMatchText(row.body, row.htmlBody),
      },
      normaliseSender,
    );
    if (!evaluation.matches) {
      continue;
    }
    if (targetCategoryId && row.categoryId === targetCategoryId) {
      truePositiveRows.push(row);
    } else {
      falsePositiveRows.push(row);
    }
  }
  return { truePositiveRows, falsePositiveRows };
}

/**
 * Evaluates `spec` against the user's last AUTO_VALIDATE_THREAD_COUNT
 * categorised emails. Returns a pass/fail decision plus the true/false
 * positive counts.
 *
 * Pass criteria (issue #1789):
 *  - Zero false positives (a match against a thread categorised under a
 *    DIFFERENT category)
 *  - At least AUTO_VALIDATE_MIN_MATCHES true positives
 *
 * Special case: when the user has no categorised history yet (new account, or
 * the target category has not yet been assigned to any thread), there is
 * nothing to validate against and we fall back to the pre-#1789 behaviour
 * of persisting the rule.
 */
export async function validateCompositeRuleAgainstHistory(
  params: ValidateCompositeRuleParams,
): Promise<ValidateCompositeRuleResult> {
  const {
    emailThreadRepository,
    userContextRepository,
    normaliseSender,
    userId,
    spec,
    categoryName,
  } = params;
  const targetCategoryId = await findCategoryContextIdByName(
    userContextRepository,
    userId,
    categoryName,
  );

  const rows = await fetchRecentCategorisedEmailRows(
    emailThreadRepository,
    userId,
  );
  const decryptedRows = rows.map(decryptValidationRow);

  const { truePositiveRows, falsePositiveRows } = partitionMatchesByCategory(
    decryptedRows,
    spec,
    normaliseSender,
    targetCategoryId,
  );
  const truePositives = truePositiveRows.length;
  const falsePositives = falsePositiveRows.length;

  if (rows.length === 0 || !targetCategoryId) {
    return { passes: true, truePositives, falsePositives };
  }

  const passes =
    falsePositives === 0 &&
    truePositives >= CATEGORY_RULE_COMPOSITE.AUTO_VALIDATE_MIN_MATCHES;

  return { passes, truePositives, falsePositives };
}
