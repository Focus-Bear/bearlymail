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
  mergeExclusionsIntoSpec,
  specHasExclusion,
  specHasStructuralConstraint,
} from "./category-rules-match-gate.helper";
import {
  DecryptedValidationRow,
  decryptValidationRow,
  fetchRecentCategorisedEmailRows,
  fetchRecentThreadsForCategoryRows,
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

/**
 * Whether a draft rule clears the validation match gate. A zero-false-positive
 * STRUCTURAL rule (one pinned to a resolved notification sub-stream) is a hard
 * deterministic separator, so a single true positive is enough to keep it —
 * AUTO_VALIDATE_MIN_MATCHES is waived. Phrase-only rules still need the full
 * min-match count. Any false positive fails the gate regardless.
 */
export function passesValidationMatchGate(
  spec: CompositeCategoryRuleSpec,
  truePositives: number,
  falsePositives: number,
): boolean {
  if (falsePositives !== 0) {
    return false;
  }
  if (
    specHasStructuralConstraint(spec) &&
    truePositives >=
      CATEGORY_RULE_COMPOSITE.AUTO_VALIDATE_STRUCTURAL_MIN_MATCHES
  ) {
    return true;
  }
  return truePositives >= CATEGORY_RULE_COMPOSITE.AUTO_VALIDATE_MIN_MATCHES;
}

/**
 * True when the category name marks it as a QA category. QA categories SHOULD
 * match QA test artefacts, so they must NOT receive the QA-template exclusions.
 */
export function isQaCategory(categoryName: string): boolean {
  const normalized = categoryName.trim().toLowerCase();
  return CATEGORY_RULE_COMPOSITE.QA_CATEGORY_KEYWORDS.some((keyword) =>
    normalized.includes(keyword),
  );
}

/** True when a v3 spec is pinned to a GitHub notification sub-stream. */
function isGithubStructuralSpec(spec: CompositeCategoryRuleSpec): boolean {
  return (
    spec.v === 3 && (spec.notificationSubtype?.startsWith("github:") ?? false)
  );
}

/**
 * For a non-QA GitHub category, adds the QA template markers (`Test Environment`,
 * `Test Objective`, `Preconditions`) as body NOT-contains exclusions. Structured
 * QA test comments arrive as GitHub notifications and follow this heading
 * template, but a QA test PLAN carries no Pass/Fail result word, so the brittle
 * Pass/Fail heuristic misses them and they leak into non-QA GitHub categories.
 * These markers exclude them regardless of Pass/Fail wording. Returns the spec
 * unchanged for non-GitHub rules and for QA categories (which should keep
 * matching QA artefacts).
 */
export function augmentExclusionsForQaTemplates(
  spec: CompositeCategoryRuleSpec,
  categoryName: string,
): CompositeCategoryRuleSpec {
  if (!isGithubStructuralSpec(spec) || isQaCategory(categoryName)) {
    return spec;
  }
  return mergeExclusionsIntoSpec(
    spec,
    [],
    [...CATEGORY_RULE_COMPOSITE.QA_TEMPLATE_MARKERS],
  );
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
  const passes = passesValidationMatchGate(
    finalSpec,
    truePositives,
    falsePositives,
  );
  return {
    passes,
    truePositives,
    falsePositives,
    finalSpec: passes ? finalSpec : null,
  };
}

interface ValidationWindows {
  /** The candidate category's OWN recent threads — the dense true-positive window. */
  categoryRows: DecryptedValidationRow[];
  /** A BROAD recent sample of all categorised mail — the false-positive window. */
  broadRows: DecryptedValidationRow[];
}

/**
 * Fetches the two validation windows (undecrypted rows -> decrypted): true
 * positives are sought in the candidate category's OWN recent threads (dense),
 * false positives in a BROAD recent sample of all categorised mail. Splitting
 * the windows lets a structural rule cover a whole sub-stream without its true
 * positives being diluted across the mailbox, while an over-broad rule is still
 * caught against non-category threads. Returned unpartitioned so the refine loop
 * can re-partition against an evolving spec each round.
 */
async function fetchValidationWindows(
  emailThreadRepository: Repository<EmailThread>,
  userId: string,
  targetCategoryId: string | null,
): Promise<ValidationWindows> {
  const broadRows = (
    await fetchRecentCategorisedEmailRows(emailThreadRepository, userId)
  ).map(decryptValidationRow);
  const categoryRows = targetCategoryId
    ? (
        await fetchRecentThreadsForCategoryRows(
          emailThreadRepository,
          userId,
          targetCategoryId,
        )
      ).map(decryptValidationRow)
    : [];
  return { categoryRows, broadRows };
}

/** Residual true positives of `spec` against the dense category window. */
function truePositivesOf(
  categoryRows: DecryptedValidationRow[],
  spec: CompositeCategoryRuleSpec,
  normaliseSender: (raw: string) => string,
  targetCategoryId: string | null,
): DecryptedValidationRow[] {
  return partitionMatchesByCategory(
    categoryRows,
    spec,
    normaliseSender,
    targetCategoryId,
  ).truePositiveRows;
}

/** Residual false positives of `spec` against the broad window. */
function falsePositivesOf(
  broadRows: DecryptedValidationRow[],
  spec: CompositeCategoryRuleSpec,
  normaliseSender: (raw: string) => string,
  targetCategoryId: string | null,
): DecryptedValidationRow[] {
  return partitionMatchesByCategory(
    broadRows,
    spec,
    normaliseSender,
    targetCategoryId,
  ).falsePositiveRows;
}

/** Derives one round of FP-distinguishing exclusion phrases from the residual FP set. */
async function deriveExclusionsForResidualFps(
  llmCategoriesService: LLMCategoriesService,
  categoryName: string,
  userId: string,
  truePositiveRows: DecryptedValidationRow[],
  falsePositiveRows: DecryptedValidationRow[],
): Promise<{ subjectNotContainsAny: string[]; bodyNotContainsAny: string[] }> {
  const tpSamples = truePositiveRows
    .slice(0, CATEGORY_RULE_COMPOSITE.DERIVE_EXCLUSIONS_MAX_SAMPLES)
    .map(rowToSample);
  const fpSamples = falsePositiveRows
    .slice(0, CATEGORY_RULE_COMPOSITE.DERIVE_EXCLUSIONS_MAX_SAMPLES)
    .map(rowToSample);
  return llmCategoriesService.deriveExclusionPhrasesFromFalsePositives({
    categoryName,
    truePositives: tpSamples,
    falsePositives: fpSamples,
    maxSubjectNotPhrases: CATEGORY_RULE_COMPOSITE.MAX_SUBJECT_NOT_PHRASES,
    maxBodyNotPhrases: CATEGORY_RULE_COMPOSITE.MAX_BODY_NOT_PHRASES,
    userId,
  });
}

/** Whether two specs carry the same exclusion phrase sets (a no-op merge). */
function sameExclusions(
  before: CompositeCategoryRuleSpec,
  after: CompositeCategoryRuleSpec,
): boolean {
  const key = (spec: CompositeCategoryRuleSpec): string => {
    if (spec.v === CATEGORY_RULE_COMPOSITE.SPEC_VERSION_V1) return "";
    const subject = [...(spec.subjectNotContainsAny ?? [])].sort().join("|");
    const body = [...(spec.bodyNotContainsAny ?? [])].sort().join("|");
    return `${subject}##${body}`;
  };
  return key(before) === key(after);
}

interface RefineLoopParams {
  llmCategoriesService: LLMCategoriesService;
  normaliseSender: (raw: string) => string;
  userId: string;
  categoryName: string;
  targetCategoryId: string | null;
  positiveSpec: CompositeCategoryRuleSpec;
  categoryRows: DecryptedValidationRow[];
  broadRows: DecryptedValidationRow[];
  logLine: (fields: string) => void;
}

/**
 * Iteratively refines a candidate rule that still produces false positives.
 * Each round: partition the windows against the CURRENT spec, derive further
 * exclusions from the residual false positives, keep only the discriminative
 * ones (never dropping true positives), accumulate them, and re-evaluate. The
 * loop persists as soon as it converges (false positives at or below the
 * acceptable threshold and the match gate passes) and gives up after
 * MAX_RULE_REFINE_ROUNDS. It also stops early — and rejects — when a round adds
 * no new exclusion or fails to reduce the false-positive count, so it is always
 * bounded and never spins.
 */
async function refineExclusionsIteratively(
  params: RefineLoopParams,
): Promise<DeriveExclusionsOutcome> {
  const {
    llmCategoriesService,
    normaliseSender,
    userId,
    categoryName,
    targetCategoryId,
    positiveSpec,
    categoryRows,
    broadRows,
    logLine,
  } = params;

  let currentSpec = positiveSpec;
  let stopReason = "rounds-exhausted";

  for (
    let round = 1;
    round <= CATEGORY_RULE_COMPOSITE.MAX_RULE_REFINE_ROUNDS;
  ) {
    const tpRows = truePositivesOf(
      categoryRows,
      currentSpec,
      normaliseSender,
      targetCategoryId,
    );
    const fpRows = falsePositivesOf(
      broadRows,
      currentSpec,
      normaliseSender,
      targetCategoryId,
    );

    const derived = await deriveExclusionsForResidualFps(
      llmCategoriesService,
      categoryName,
      userId,
      tpRows,
      fpRows,
    );
    const selected = selectDiscriminativeExclusions(derived, tpRows, fpRows);
    if (
      selected.subjectNotContainsAny.length === 0 &&
      selected.bodyNotContainsAny.length === 0
    ) {
      stopReason = "no-new-exclusions";
      break;
    }

    const nextSpec = mergeExclusionsIntoSpec(
      currentSpec,
      selected.subjectNotContainsAny,
      selected.bodyNotContainsAny,
    );
    if (sameExclusions(currentSpec, nextSpec)) {
      stopReason = "no-new-exclusions";
      break;
    }

    const nextFpCount = falsePositivesOf(
      broadRows,
      nextSpec,
      normaliseSender,
      targetCategoryId,
    ).length;
    // Exclusions can only ever remove matches, so a round that does not strictly
    // reduce the false-positive count cannot help — stop rather than spin.
    if (nextFpCount >= fpRows.length) {
      stopReason = "no-fp-improvement";
      break;
    }

    logLine(
      `branch=refine round=${round} preFP=${fpRows.length} postFP=${nextFpCount} ` +
        `addedSubjectNot=${selected.subjectNotContainsAny.length} ` +
        `addedBodyNot=${selected.bodyNotContainsAny.length}`,
    );
    currentSpec = nextSpec;
    round += 1;

    if (nextFpCount <= CATEGORY_RULE_COMPOSITE.RULE_MAX_ACCEPTABLE_FP) {
      stopReason = "converged";
      break;
    }
  }

  return buildRefineOutcome({
    currentSpec,
    categoryRows,
    broadRows,
    normaliseSender,
    targetCategoryId,
    stopReason,
    logLine,
  });
}

/**
 * Final evaluation of the refined spec once the loop stops: re-measure TP/FP,
 * require at least one exclusion (a bare positive-only spec never survives the
 * refine path), and apply the standard match gate. Emits the summary log line.
 */
function buildRefineOutcome(params: {
  currentSpec: CompositeCategoryRuleSpec;
  categoryRows: DecryptedValidationRow[];
  broadRows: DecryptedValidationRow[];
  normaliseSender: (raw: string) => string;
  targetCategoryId: string | null;
  stopReason: string;
  logLine: (fields: string) => void;
}): DeriveExclusionsOutcome {
  const {
    currentSpec,
    categoryRows,
    broadRows,
    normaliseSender,
    targetCategoryId,
    stopReason,
    logLine,
  } = params;
  const finalTp = truePositivesOf(
    categoryRows,
    currentSpec,
    normaliseSender,
    targetCategoryId,
  ).length;
  const finalFp = falsePositivesOf(
    broadRows,
    currentSpec,
    normaliseSender,
    targetCategoryId,
  ).length;
  const passes =
    specHasExclusion(currentSpec) &&
    passesValidationMatchGate(currentSpec, finalTp, finalFp);
  logLine(
    `branch=refine-done stopReason=${stopReason} finalTP=${finalTp} finalFP=${finalFp} passes=${passes}`,
  );
  return {
    passes,
    truePositives: finalTp,
    falsePositives: finalFp,
    finalSpec: passes ? currentSpec : null,
  };
}

/**
 * Top-level orchestrator. Fetches the validation windows, evaluates the
 * positive-only spec, and — when it still produces false positives — runs the
 * iterative refine loop that derives, accumulates, and re-validates exclusions
 * until the rule converges or the round budget is exhausted.
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

  const { categoryRows, broadRows } = await fetchValidationWindows(
    emailThreadRepository,
    userId,
    targetCategoryId,
  );

  const truePositiveRows = truePositivesOf(
    categoryRows,
    positiveSpec,
    normaliseSender,
    targetCategoryId,
  );
  const falsePositiveRows = falsePositivesOf(
    broadRows,
    positiveSpec,
    normaliseSender,
    targetCategoryId,
  );
  const truePositives = truePositiveRows.length;
  const falsePositives = falsePositiveRows.length;

  if (broadRows.length === 0 || !targetCategoryId) {
    // Same fallback as `validateCompositeRuleAgainstHistory` — no history to
    // validate against, so we accept the positive-only spec.
    logLine(
      `branch=no-history broadRows=${broadRows.length} hasCategoryId=${!!targetCategoryId} passes=true`,
    );
    return {
      passes: true,
      truePositives,
      falsePositives,
      finalSpec: positiveSpec,
    };
  }

  if (falsePositives <= CATEGORY_RULE_COMPOSITE.RULE_MAX_ACCEPTABLE_FP) {
    const passes = passesValidationMatchGate(
      positiveSpec,
      truePositives,
      falsePositives,
    );
    // Clean, zero-FP candidate. When this fails it is because the sender+phrase
    // spec matched fewer than `minRequired` threads in the target category —
    // i.e. the TP-count gate, NOT exclusions.
    logLine(
      `branch=clean-zero-fp preTP=${truePositives} preFP=${falsePositives} passes=${passes}`,
    );
    return {
      passes,
      truePositives,
      falsePositives,
      finalSpec: passes ? positiveSpec : null,
    };
  }

  return refineExclusionsIteratively({
    llmCategoriesService,
    normaliseSender,
    userId,
    categoryName,
    targetCategoryId,
    positiveSpec,
    categoryRows,
    broadRows,
    logLine,
  });
}
