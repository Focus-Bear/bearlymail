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
import { CompositeCategoryRuleSpec } from "../database/entities/category-rule.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import {
  ExclusionDerivationSample,
  LLMCategoriesService,
} from "../llm/llm-categories.service";
import {
  DecryptedValidationRow,
  decryptValidationRow,
  fetchRecentCategorisedEmailRows,
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
  finalSpec: CompositeCategoryRuleSpec | null;
}

export interface DeriveExclusionsParams {
  emailThreadRepository: Repository<EmailThread>;
  llmCategoriesService: LLMCategoriesService;
  normaliseSender: (raw: string) => string;
  userId: string;
  positiveSpec: CompositeCategoryRuleSpec;
  categoryName: string;
  /** FK UUID from UserContext — used directly instead of a name-based lookup. */
  categoryId: string | null;
  /**
   * INFO-level sink for the per-candidate diagnostic line. Auto-generation
   * decisions are otherwise logged at `debug` (suppressed in prod), which hid
   * why exclusion rules never persist — see the branch summaries below.
   */
  logger: { log: (message: string) => void };
}

function rowToSample(row: DecryptedValidationRow): ExclusionDerivationSample {
  return {
    subject: row.subject || "",
    body: row.body || "",
  };
}

function applyExclusionsToSpec(
  spec: CompositeCategoryRuleSpec,
  subjectNotContainsAny: string[],
  bodyNotContainsAny: string[],
): CompositeCategoryRuleSpec {
  const slicedSubjectNot =
    subjectNotContainsAny.length > 0
      ? subjectNotContainsAny.slice(
          0,
          CATEGORY_RULE_COMPOSITE.MAX_SUBJECT_NOT_PHRASES,
        )
      : undefined;
  const slicedBodyNot =
    bodyNotContainsAny.length > 0
      ? bodyNotContainsAny.slice(
          0,
          CATEGORY_RULE_COMPOSITE.MAX_BODY_NOT_PHRASES,
        )
      : undefined;
  const exclusions = {
    ...(slicedSubjectNot && { subjectNotContainsAny: slicedSubjectNot }),
    ...(slicedBodyNot && { bodyNotContainsAny: slicedBodyNot }),
  };
  if (spec.v === CATEGORY_RULE_COMPOSITE.SPEC_VERSION) {
    return { ...spec, ...exclusions };
  }
  if (spec.v === CATEGORY_RULE_COMPOSITE.SPEC_VERSION_V2) {
    return { ...spec, ...exclusions };
  }
  // V1 has no exclusion fields: upgrade to V2
  return {
    v: CATEGORY_RULE_COMPOSITE.SPEC_VERSION_V2,
    senderMatchesAny: [spec.sender],
    subjectContainsAny: [spec.subjectContains],
    bodyContainsAny: spec.bodyContainsAny,
    ...exclusions,
  };
}

export interface ApplyDerivedExclusionsParams {
  positiveSpec: CompositeCategoryRuleSpec;
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

/** Human-readable reason a derived-exclusion candidate passed or failed, for the diagnostic log. */
function describeFpDeriveOutcome(result: DeriveExclusionsOutcome): string {
  if (result.passes) return "ok";
  if (result.falsePositives > 0) return "fp-not-cleared";
  return `tp-below-min(${result.truePositives})`;
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
    llmCategoriesService,
    normaliseSender,
    userId,
    positiveSpec,
    categoryName,
    categoryId: targetCategoryId,
    logger,
  } = params;

  const minMatches = CATEGORY_RULE_COMPOSITE.AUTO_VALIDATE_MIN_MATCHES;
  const logLine = (fields: string): void =>
    logger.log(
      `[CategoryRules][derive] category="${categoryName}" minRequired=${minMatches} ${fields} user=${userId}`,
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
    logLine(
      `branch=no-history rows=${decryptedRows.length} hasCategoryId=${!!targetCategoryId} passes=true`,
    );
    return {
      passes: true,
      truePositives,
      falsePositives,
      finalSpec: positiveSpec,
    };
  }

  if (falsePositives === 0) {
    const passes = truePositives >= minMatches;
    // Clean, zero-FP candidate. When this fails it is because the sender+phrase
    // spec matched fewer than `minRequired` threads in the target category —
    // i.e. the TP-count gate, NOT exclusions.
    logLine(
      `branch=clean-zero-fp preTP=${truePositives} preFP=0 passes=${passes}`,
    );
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

  const result = applyDerivedExclusionsAndCheck({
    positiveSpec,
    truePositiveRows,
    falsePositiveRows,
    derived,
    normaliseSender,
    targetCategoryId,
  });

  // The decisive line: whether a rule WITH exclusions survives. `postFP>0`
  // means the LLM's phrases did not eliminate every false positive; `postTP`
  // below `minRequired` means the exclusions (or the base spec) match too few
  // target-category threads. `derived*=0` means the LLM found no separator.
  logLine(
    `branch=fp-derive preTP=${truePositives} preFP=${falsePositives} ` +
      `derivedSubjectNot=${derived.subjectNotContainsAny.length} ` +
      `derivedBodyNot=${derived.bodyNotContainsAny.length} ` +
      `postTP=${result.truePositives} postFP=${result.falsePositives} ` +
      `passes=${result.passes} reason=${describeFpDeriveOutcome(result)}`,
  );

  return result;
}
