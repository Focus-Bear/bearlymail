/**
 * Issue #1789: helpers that validate a draft composite rule against the user's
 * recent thread history before it is auto-persisted. Extracted from
 * `category-rules.service.ts` so the service stays under the 800-line lint cap.
 */
import { Repository } from "typeorm";

import { CATEGORY_RULE_COMPOSITE } from "../constants/category-rule-composite.constants";
import { CompositeCategoryRuleSpec } from "../database/entities/category-rule.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import {
  ContextKey,
  UserContext,
} from "../database/entities/user-context.entity";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { buildRuleMatchText } from "../llm/email-content-cleaner";
import { evaluateComposite } from "./category-rules-auto-composite.helper";

export interface ValidateCompositeRuleResult {
  passes: boolean;
  truePositives: number;
  falsePositives: number;
}

/**
 * Returns the contextId of the EMAIL_CATEGORY UserContext row whose decrypted
 * contextValue matches `categoryName` (case-insensitive). Null when no match.
 */
export async function findCategoryContextIdByName(
  userContextRepository: Repository<UserContext>,
  userId: string,
  categoryName: string,
): Promise<string | null> {
  const normalised = categoryName.trim().toLowerCase();
  if (!normalised) return null;
  const contexts = await userContextRepository.find({
    where: { userId, contextKey: ContextKey.EMAIL_CATEGORY },
    select: {
      contextId: true,
      contextValue: true,
    },
  });
  const match = contexts.find(
    (ctx) => ctx.contextValue?.trim().toLowerCase() === normalised,
  );
  return match?.contextId ?? null;
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
