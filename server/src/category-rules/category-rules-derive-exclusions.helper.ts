/**
 * Issue #1789 follow-up: derive `subjectNotContainsAny` / `bodyNotContainsAny`
 * exclusion phrases for an auto-generated composite rule from REAL false
 * positives in the user's email history, instead of asking the LLM to
 * speculate about exclusions blind.
 *
 * Flow used by `category-rules.service.ts#generateCompositeRuleFromEmail`:
 *   1. The first LLM call returns positives only (sender + subject + body).
 *   2. We evaluate that positive-only spec against the user's recent
 *      categorised threads.
 *   3. Zero false positives → re-validate with the standard pass criteria
 *      and we're done.
 *   4. Any false positives → ask the LLM for short phrases that appear in
 *      the FP samples but not the TP samples; apply them (capped by
 *      MAX_SUBJECT_NOT_PHRASES / MAX_BODY_NOT_PHRASES); re-validate.
 *   5. If the rule still does not pass after the re-validation, callers
 *      discard it.
 */
import { Repository } from "typeorm";

import { CATEGORY_RULE_COMPOSITE } from "../constants/category-rule-composite.constants";
import { CompositeCategoryRuleSpecV2 } from "../database/entities/category-rule.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { UserContext } from "../database/entities/user-context.entity";
import {
  ExclusionDerivationSample,
  LLMCategoriesService,
} from "../llm/llm-categories.service";
import {
  DecryptedValidationRow,
  decryptValidationRow,
  fetchRecentCategorisedEmailRows,
  findCategoryContextIdByName,
  partitionMatchesByCategory,
} from "./category-rules-validate.helper";

/**
 * Outcome of the derive-exclusions step. `finalSpec` is the spec that
 * should be persisted (with derived exclusions applied when relevant), or
 * `null` when the rule failed validation and must be discarded.
 */
export interface DeriveExclusionsOutcome {
  passes: boolean;
  truePositives: number;
  falsePositives: number;
  finalSpec: CompositeCategoryRuleSpecV2 | null;
}

export interface DeriveExclusionsParams {
  emailThreadRepository: Repository<EmailThread>;
  userContextRepository: Repository<UserContext>;
  llmCategoriesService: LLMCategoriesService;
  normaliseSender: (raw: string) => string;
  userId: string;
  positiveSpec: CompositeCategoryRuleSpecV2;
  categoryName: string;
}

function rowToSample(row: DecryptedValidationRow): ExclusionDerivationSample {
  return {
    subject: row.subject || "",
    body: row.body || "",
  };
}

function applyExclusionsToSpec(
  spec: CompositeCategoryRuleSpecV2,
  subjectNotContainsAny: string[],
  bodyNotContainsAny: string[],
): CompositeCategoryRuleSpecV2 {
  const next: CompositeCategoryRuleSpecV2 = {
    v: spec.v,
    senderMatchesAny: spec.senderMatchesAny,
    subjectContainsAny: spec.subjectContainsAny,
    bodyContainsAny: spec.bodyContainsAny,
  };
  if (subjectNotContainsAny.length > 0) {
    next.subjectNotContainsAny = subjectNotContainsAny.slice(
      0,
      CATEGORY_RULE_COMPOSITE.MAX_SUBJECT_NOT_PHRASES,
    );
  }
  if (bodyNotContainsAny.length > 0) {
    next.bodyNotContainsAny = bodyNotContainsAny.slice(
      0,
      CATEGORY_RULE_COMPOSITE.MAX_BODY_NOT_PHRASES,
    );
  }
  return next;
}

export interface ApplyDerivedExclusionsParams {
  positiveSpec: CompositeCategoryRuleSpecV2;
  truePositiveRows: DecryptedValidationRow[];
  falsePositiveRows: DecryptedValidationRow[];
  derived: { subjectNotContainsAny: string[]; bodyNotContainsAny: string[] };
  normaliseSender: (raw: string) => string;
  targetCategoryId: string | null;
}

/**
 * Pure-function variant exposed for unit tests: given decrypted validation
 * rows, the positive-only spec, and a TP/FP partition, decide whether the
 * rule passes outright, needs exclusions, or must be discarded.
 *
 * The async `deriveExclusionsForCompositeRule` orchestrator wraps this with
 * the SQL fetch and the LLM call.
 */
export function applyDerivedExclusionsAndCheck(
  params: ApplyDerivedExclusionsParams,
): DeriveExclusionsOutcome {
  const {
    positiveSpec,
    truePositiveRows,
    falsePositiveRows,
    derived,
    normaliseSender,
    targetCategoryId,
  } = params;
  if (
    derived.subjectNotContainsAny.length === 0 &&
    derived.bodyNotContainsAny.length === 0
  ) {
    return {
      passes: false,
      truePositives: truePositiveRows.length,
      falsePositives: falsePositiveRows.length,
      finalSpec: null,
    };
  }

  const finalSpec = applyExclusionsToSpec(
    positiveSpec,
    derived.subjectNotContainsAny,
    derived.bodyNotContainsAny,
  );
  const allRows = [...truePositiveRows, ...falsePositiveRows];
  const rePartition = partitionMatchesByCategory(
    allRows,
    finalSpec,
    normaliseSender,
    targetCategoryId,
  );
  const truePositives = rePartition.truePositiveRows.length;
  const falsePositives = rePartition.falsePositiveRows.length;
  const passes =
    falsePositives === 0 &&
    truePositives >= CATEGORY_RULE_COMPOSITE.AUTO_VALIDATE_MIN_MATCHES;
  return {
    passes,
    truePositives,
    falsePositives,
    finalSpec: passes ? finalSpec : null,
  };
}

/**
 * Top-level orchestrator. Fetches the validation window, evaluates the
 * positive-only spec, derives FP-distinguishing exclusions via the LLM
 * when needed, applies them, and re-validates.
 */
export async function deriveExclusionsForCompositeRule(
  params: DeriveExclusionsParams,
): Promise<DeriveExclusionsOutcome> {
  const {
    emailThreadRepository,
    userContextRepository,
    llmCategoriesService,
    normaliseSender,
    userId,
    positiveSpec,
    categoryName,
  } = params;

  const targetCategoryId = await findCategoryContextIdByName(
    userContextRepository,
    userId,
    categoryName,
  );

  const rawRows = await fetchRecentCategorisedEmailRows(
    emailThreadRepository,
    userId,
  );
  const decryptedRows = rawRows.map(decryptValidationRow);

  const { truePositiveRows, falsePositiveRows } = partitionMatchesByCategory(
    decryptedRows,
    positiveSpec,
    normaliseSender,
    targetCategoryId,
  );
  const truePositives = truePositiveRows.length;
  const falsePositives = falsePositiveRows.length;

  if (decryptedRows.length === 0 || !targetCategoryId) {
    // Same fallback as `validateCompositeRuleAgainstHistory` — no history to
    // validate against, so we accept the positive-only spec.
    return {
      passes: true,
      truePositives,
      falsePositives,
      finalSpec: positiveSpec,
    };
  }

  if (falsePositives === 0) {
    const passes =
      truePositives >= CATEGORY_RULE_COMPOSITE.AUTO_VALIDATE_MIN_MATCHES;
    return {
      passes,
      truePositives,
      falsePositives,
      finalSpec: passes ? positiveSpec : null,
    };
  }

  const tpSamples = truePositiveRows
    .slice(0, CATEGORY_RULE_COMPOSITE.DERIVE_EXCLUSIONS_MAX_SAMPLES)
    .map(rowToSample);
  const fpSamples = falsePositiveRows
    .slice(0, CATEGORY_RULE_COMPOSITE.DERIVE_EXCLUSIONS_MAX_SAMPLES)
    .map(rowToSample);

  const derived =
    await llmCategoriesService.deriveExclusionPhrasesFromFalsePositives({
      categoryName,
      truePositives: tpSamples,
      falsePositives: fpSamples,
      maxSubjectNotPhrases: CATEGORY_RULE_COMPOSITE.MAX_SUBJECT_NOT_PHRASES,
      maxBodyNotPhrases: CATEGORY_RULE_COMPOSITE.MAX_BODY_NOT_PHRASES,
      userId,
    });

  return applyDerivedExclusionsAndCheck({
    positiveSpec,
    truePositiveRows,
    falsePositiveRows,
    derived,
    normaliseSender,
    targetCategoryId,
  });
}
