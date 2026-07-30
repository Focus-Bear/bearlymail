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
import { buildRuleMatchText } from "../llm/email-content-cleaner";
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

/** The lowercased subject + cleaned body text an exclusion phrase is tested against. */
interface RowFieldText {
  subject: string;
  body: string;
}

function rowFieldText(row: DecryptedValidationRow): RowFieldText {
  return {
    subject: (row.subject || "").toLowerCase(),
    body: buildRuleMatchText(row.body, row.htmlBody).toLowerCase(),
  };
}

/** The two email fields an exclusion phrase can be tested against. */
const EXCLUSION_FIELD = {
  SUBJECT: "subject",
  BODY: "body",
} as const;
type ExclusionField = (typeof EXCLUSION_FIELD)[keyof typeof EXCLUSION_FIELD];

/**
 * A candidate exclusion phrase that has already cleared the quality bar and the
 * set of false-positive row indices it would disqualify (in the field it
 * applies to).
 */
interface ExclusionCandidate {
  phrase: string;
  field: ExclusionField;
  fpHitIndices: Set<number>;
}

/**
 * Builds a quality-checked candidate for a single derived phrase, or null when
 * the phrase fails the bar. A phrase is only viable when it is long enough to be
 * meaningful, appears in NO true positive (excluding it would drop genuine
 * category mail), and appears in at least DERIVE_EXCLUSION_MIN_FP_HITS false
 * positives (it actually reduces false positives rather than being noise).
 */
function buildExclusionCandidate(
  phrase: string,
  field: ExclusionField,
  tpTexts: RowFieldText[],
  fpTexts: RowFieldText[],
): ExclusionCandidate | null {
  const needle = phrase.trim().toLowerCase();
  if (
    needle.length < CATEGORY_RULE_COMPOSITE.DERIVE_EXCLUSION_MIN_PHRASE_LENGTH
  ) {
    return null;
  }
  if (tpTexts.some((text) => text[field].includes(needle))) {
    return null;
  }
  const fpHitIndices = new Set<number>();
  fpTexts.forEach((text, index) => {
    if (text[field].includes(needle)) {
      fpHitIndices.add(index);
    }
  });
  if (
    fpHitIndices.size < CATEGORY_RULE_COMPOSITE.DERIVE_EXCLUSION_MIN_FP_HITS
  ) {
    return null;
  }
  return { phrase, field, fpHitIndices };
}

/**
 * Filters the LLM's raw derived exclusions down to a minimal, genuinely
 * discriminative set (junk-exclusion fix).
 *
 * The LLM tends to return brittle fragments that happen to sit in one FP sample
 * but separate no category. We keep only phrases that (a) never appear in a true
 * positive and (b) each remove at least one FALSE positive not already covered
 * by a stronger phrase (greedy set-cover). Everything else — short fragments,
 * TP-overlapping phrases, redundant duplicates — is dropped. When nothing clears
 * the bar both lists come back empty and the caller discards the rule.
 */
export function selectDiscriminativeExclusions(
  derived: { subjectNotContainsAny: string[]; bodyNotContainsAny: string[] },
  truePositiveRows: DecryptedValidationRow[],
  falsePositiveRows: DecryptedValidationRow[],
): { subjectNotContainsAny: string[]; bodyNotContainsAny: string[] } {
  const tpTexts = truePositiveRows.map(rowFieldText);
  const fpTexts = falsePositiveRows.map(rowFieldText);

  const candidates = [
    ...derived.subjectNotContainsAny.map((phrase) =>
      buildExclusionCandidate(
        phrase,
        EXCLUSION_FIELD.SUBJECT,
        tpTexts,
        fpTexts,
      ),
    ),
    ...derived.bodyNotContainsAny.map((phrase) =>
      buildExclusionCandidate(phrase, EXCLUSION_FIELD.BODY, tpTexts, fpTexts),
    ),
  ].filter((candidate): candidate is ExclusionCandidate => candidate !== null);

  // Strongest (most FPs removed) first, so the greedy pass keeps the smallest
  // discriminative set and drops phrases that add no new coverage.
  candidates.sort(
    (left, right) => right.fpHitIndices.size - left.fpHitIndices.size,
  );

  const coveredFpIndices = new Set<number>();
  const subjectNotContainsAny: string[] = [];
  const bodyNotContainsAny: string[] = [];
  for (const candidate of candidates) {
    let newlyCovered = 0;
    for (const index of candidate.fpHitIndices) {
      if (!coveredFpIndices.has(index)) newlyCovered += 1;
    }
    if (newlyCovered < CATEGORY_RULE_COMPOSITE.DERIVE_EXCLUSION_MIN_FP_HITS) {
      continue;
    }
    for (const index of candidate.fpHitIndices) coveredFpIndices.add(index);
    if (candidate.field === EXCLUSION_FIELD.SUBJECT) {
      subjectNotContainsAny.push(candidate.phrase);
    } else {
      bodyNotContainsAny.push(candidate.phrase);
    }
  }
  return { subjectNotContainsAny, bodyNotContainsAny };
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

  // Quality bar: keep only genuinely discriminative exclusions and drop junk
  // fragments. If nothing survives, emit no rule — a brittle rule with garbage
  // NOT-contains conditions is worse than none.
  const selected = selectDiscriminativeExclusions(
    derived,
    truePositiveRows,
    falsePositiveRows,
  );
  if (
    selected.subjectNotContainsAny.length === 0 &&
    selected.bodyNotContainsAny.length === 0
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
    selected.subjectNotContainsAny,
    selected.bodyNotContainsAny,
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
