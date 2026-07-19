import { CATEGORY_RULE_COMPOSITE } from "../constants/category-rule-composite.constants";
import {
  CATEGORY_RULE_KINDS,
  CATEGORY_RULE_MATCH_MODES,
  CATEGORY_RULE_TYPES,
} from "../constants/domain-types";
import { SearchIndexHelper } from "../contacts/search-index.helper";
import {
  CategoryRule,
  CompositeCategoryRuleSpec,
  CompositeCategoryRuleSpecV1,
  CompositeCategoryRuleSpecV2,
} from "../database/entities/category-rule.entity";
import type {
  CompositeRuleEvaluationDetail,
  EmailMetadata,
} from "./category-rules.types";

export interface EmailHashes {
  senderHash: string;
  domainPattern: string | null;
  domainHash: string | null;
  subjectPrefix: string | null;
  prefixHash: string | null;
}

export function rulePatternMatches(
  rule: Pick<CategoryRule, "ruleType" | "patternHash" | "ruleKind">,
  hashes: EmailHashes,
): boolean {
  if (
    rule.ruleKind !== CATEGORY_RULE_KINDS.LEGACY ||
    !rule.ruleType ||
    !rule.patternHash
  ) {
    return false;
  }
  const { senderHash, domainPattern, domainHash, subjectPrefix, prefixHash } =
    hashes;
  if (rule.ruleType === CATEGORY_RULE_TYPES.EXACT_SENDER) {
    return rule.patternHash === senderHash;
  }
  if (rule.ruleType === CATEGORY_RULE_TYPES.SENDER_DOMAIN) {
    return domainHash !== null && rule.patternHash === domainHash;
  }
  if (rule.ruleType === CATEGORY_RULE_TYPES.SUBJECT_PREFIX) {
    return prefixHash !== null && rule.patternHash === prefixHash;
  }
  if (
    rule.ruleType === CATEGORY_RULE_MATCH_MODES.SENDER_DOMAIN_AND_SUBJECT_PREFIX
  ) {
    if (!domainPattern || !subjectPrefix) {
      return false;
    }
    const combinedHashInput = `${domainPattern.toLowerCase()}|${subjectPrefix.toLowerCase()}`;
    const combinedHash = SearchIndexHelper.hashExact(combinedHashInput);
    return rule.patternHash === combinedHash;
  }
  return false;
}

export function pickAutoCompositeSubjectPhrase(subject: string): string | null {
  const trimmed = subject.trim();
  if (!trimmed) {
    return null;
  }
  const max = CATEGORY_RULE_COMPOSITE.MAX_SUBJECT_CONTAINS_LENGTH;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

export function pickAutoCompositeBodyPhrase(
  bodyTextForMatch: string | undefined,
): string | null {
  if (!bodyTextForMatch?.trim()) {
    return null;
  }
  const min = CATEGORY_RULE_COMPOSITE.AUTO_COMPOSITE_RULE_MIN_BODY_PHRASE_CHARS;
  const normalized = bodyTextForMatch.replace(/\s+/g, " ").trim();
  const lines = bodyTextForMatch.split(/\r?\n/);
  const substantialLine = lines
    .map((line) => line.replace(/\s+/g, " ").trim())
    .find((line) => line.length >= min);
  const candidate = substantialLine ?? normalized;
  if (candidate.length < min) {
    return null;
  }
  return candidate.slice(0, CATEGORY_RULE_COMPOSITE.MAX_BODY_PHRASE_LENGTH);
}

/** Normalise a v1/v2/v3 spec into the v2 array shape for unified evaluation. */
export function specToV2(
  spec: CompositeCategoryRuleSpec,
): CompositeCategoryRuleSpecV2 {
  if (spec.v === 3) {
    return {
      v: 2,
      senderMatchesAny: spec.fromMatchesAny,
      subjectContainsAny: spec.subjectContainsAny,
      bodyContainsAny: spec.bodyContainsAny,
      ...(spec.subjectNotContainsAny && {
        subjectNotContainsAny: spec.subjectNotContainsAny,
      }),
      ...(spec.bodyNotContainsAny && {
        bodyNotContainsAny: spec.bodyNotContainsAny,
      }),
    };
  }
  if (spec.v === 2) {
    return spec;
  }
  // v1
  const v1 = spec as CompositeCategoryRuleSpecV1;
  return {
    v: 2,
    senderMatchesAny: [v1.sender],
    subjectContainsAny: [v1.subjectContains],
    bodyContainsAny: v1.bodyContainsAny,
  };
}

export function compositeAutoSpecsMatch(
  first: CompositeCategoryRuleSpec,
  second: CompositeCategoryRuleSpec,
): boolean {
  const v2First = specToV2(first);
  const v2Second = specToV2(second);
  // Unit separator avoids false positives when joining multi-element arrays.
  const UNIT_SEP = "";
  const packStrings = (values: string[] | undefined) =>
    [...(values ?? [])]
      .map((item) => item.trim())
      .sort()
      .join(UNIT_SEP);
  return (
    packStrings(v2First.senderMatchesAny) ===
      packStrings(v2Second.senderMatchesAny) &&
    packStrings(v2First.subjectContainsAny) ===
      packStrings(v2Second.subjectContainsAny) &&
    packStrings(v2First.bodyContainsAny) ===
      packStrings(v2Second.bodyContainsAny) &&
    packStrings(v2First.subjectNotContainsAny) ===
      packStrings(v2Second.subjectNotContainsAny) &&
    packStrings(v2First.bodyNotContainsAny) ===
      packStrings(v2Second.bodyNotContainsAny)
  );
}

/**
 * True when two specs share the same sender pattern AND the same subject
 * conditions (case-insensitive, order-independent) — regardless of body
 * phrases or exclusions. Two such rules within the same category are
 * redundant: their body phrases are an OR list, so the new rule's phrases
 * should be merged into the existing one rather than persisted as a sibling
 * with identical sender + subject filters.
 */
export function senderAndSubjectMatch(
  first: CompositeCategoryRuleSpec,
  second: CompositeCategoryRuleSpec,
): boolean {
  const v2First = specToV2(first);
  const v2Second = specToV2(second);
  const UNIT_SEP = "";
  const packStringsCi = (values: string[] | undefined) =>
    [...(values ?? [])]
      .map((item) => item.trim().toLowerCase())
      .sort()
      .join(UNIT_SEP);
  return (
    packStringsCi(v2First.senderMatchesAny) ===
      packStringsCi(v2Second.senderMatchesAny) &&
    packStringsCi(v2First.subjectContainsAny) ===
      packStringsCi(v2Second.subjectContainsAny)
  );
}

interface PhraseUnionResult {
  merged: string[];
  addedAny: boolean;
}

/**
 * Returns the case-insensitive union of `existingList` and `incomingList`,
 * preserving the casing of the first occurrence of each phrase. Empty/blank
 * phrases are skipped. `addedAny` reports whether any phrase from
 * `incomingList` was new relative to `existingList`.
 */
function unionPhrasesCi(
  existingList: string[] | undefined,
  incomingList: string[] | undefined,
): PhraseUnionResult {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const phrase of existingList ?? []) {
    const trimmed = phrase.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(trimmed);
  }
  let addedAny = false;
  for (const phrase of incomingList ?? []) {
    const trimmed = phrase.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(trimmed);
    addedAny = true;
  }
  return { merged, addedAny };
}

/**
 * Returns a v3 spec built from `existing` whose `bodyContainsAny` is the
 * case-insensitive union of `existing.bodyContainsAny` and
 * `incoming.bodyContainsAny`, and whose `subjectNotContainsAny` /
 * `bodyNotContainsAny` are the case-insensitive union of both sides'
 * exclusions. The incoming exclusions were derived (via
 * `deriveExclusionsForCompositeRule`) specifically to prevent the new body
 * phrases from matching false positives, so discarding them would silently
 * regress the merged rule's precision. Sender, subject, and v3 extras come
 * from `existing` unchanged.
 *
 * Returns `null` when the merge would exceed `maxBodyPhrases`,
 * `MAX_SUBJECT_NOT_PHRASES`, or `MAX_BODY_NOT_PHRASES` (caller should reject
 * the new rule rather than silently lose phrases). Returns the `existing`
 * spec reference unchanged when `incoming` adds no new body phrases and no
 * new exclusions — the caller can short-circuit a save.
 */
export function mergeBodyPhrasesIntoSibling(
  existing: CompositeCategoryRuleSpec,
  incoming: CompositeCategoryRuleSpec,
  maxBodyPhrases: number,
): CompositeCategoryRuleSpec | null {
  const existingV2 = specToV2(existing);
  const incomingV2 = specToV2(incoming);

  const body = unionPhrasesCi(
    existingV2.bodyContainsAny,
    incomingV2.bodyContainsAny,
  );
  const subjectNot = unionPhrasesCi(
    existingV2.subjectNotContainsAny,
    incomingV2.subjectNotContainsAny,
  );
  const bodyNot = unionPhrasesCi(
    existingV2.bodyNotContainsAny,
    incomingV2.bodyNotContainsAny,
  );

  if (!body.addedAny && !subjectNot.addedAny && !bodyNot.addedAny) {
    return existing;
  }
  if (body.merged.length > maxBodyPhrases) {
    return null;
  }
  if (
    subjectNot.merged.length > CATEGORY_RULE_COMPOSITE.MAX_SUBJECT_NOT_PHRASES
  ) {
    return null;
  }
  if (bodyNot.merged.length > CATEGORY_RULE_COMPOSITE.MAX_BODY_NOT_PHRASES) {
    return null;
  }

  const mergedSubjectNot =
    subjectNot.merged.length > 0 ? subjectNot.merged : undefined;
  const mergedBodyNot = bodyNot.merged.length > 0 ? bodyNot.merged : undefined;
  const v3Extras = existing.v === 3 ? existing : null;
  return {
    v: 3,
    fromMatchesAny: existingV2.senderMatchesAny,
    subjectContainsAny: existingV2.subjectContainsAny,
    bodyContainsAny: body.merged,
    ...(mergedSubjectNot && { subjectNotContainsAny: mergedSubjectNot }),
    ...(mergedBodyNot && { bodyNotContainsAny: mergedBodyNot }),
    ...(v3Extras?.emailIsRead !== undefined && {
      emailIsRead: v3Extras.emailIsRead,
    }),
    ...(v3Extras?.emailAttachment && {
      emailAttachment: v3Extras.emailAttachment,
    }),
    ...(v3Extras?.emailReceived && { emailReceived: v3Extras.emailReceived }),
    ...(v3Extras?.emailRead && { emailRead: v3Extras.emailRead }),
  };
}

/**
 * Returns true when `normFrom` matches the sender `normPattern`.
 * Supports domain wildcards of the form `*@domain.com`, which match any
 * address at that domain (e.g. `*@github.com` matches `notifications@github.com`).
 */
export function senderMatchesPattern(
  normFrom: string,
  normPattern: string,
): boolean {
  if (normPattern.startsWith("*@")) {
    const domain = normPattern.slice(2).toLowerCase();
    return normFrom.endsWith(`@${domain}`);
  }
  return normPattern === normFrom;
}

/**
 * Returns the first exclusion phrase found in `haystack`, or null when the
 * exclusion list is empty/undefined or no phrase matches. Empty strings in
 * the exclusion list are ignored so they cannot accidentally disqualify
 * every email.
 */
function findExcludedPhrase(
  excluded: string[] | undefined,
  haystackLower: string,
): string | null {
  if (!excluded || excluded.length === 0) {
    return null;
  }
  for (const phrase of excluded) {
    const needle = phrase.trim().toLowerCase();
    if (needle.length > 0 && haystackLower.includes(needle)) {
      return phrase;
    }
  }
  return null;
}

interface ResolvedSpecFields {
  senderPatterns: string[];
  subjectPhrases: string[];
  bodyPhrases: string[];
  subjectNotPhrases: string[] | undefined;
  bodyNotPhrases: string[] | undefined;
}

function resolveSpecFields(
  spec: CompositeCategoryRuleSpec,
): ResolvedSpecFields {
  if (spec.v === CATEGORY_RULE_COMPOSITE.SPEC_VERSION) {
    return {
      senderPatterns: spec.fromMatchesAny,
      subjectPhrases: spec.subjectContainsAny,
      bodyPhrases: spec.bodyContainsAny,
      subjectNotPhrases: spec.subjectNotContainsAny,
      bodyNotPhrases: spec.bodyNotContainsAny,
    };
  }
  if (spec.v === CATEGORY_RULE_COMPOSITE.SPEC_VERSION_V2) {
    return {
      senderPatterns: spec.senderMatchesAny,
      subjectPhrases: spec.subjectContainsAny,
      bodyPhrases: spec.bodyContainsAny,
      subjectNotPhrases: spec.subjectNotContainsAny,
      bodyNotPhrases: spec.bodyNotContainsAny,
    };
  }
  return {
    senderPatterns: [spec.sender],
    subjectPhrases: [spec.subjectContains],
    bodyPhrases: spec.bodyContainsAny,
    subjectNotPhrases: undefined,
    bodyNotPhrases: undefined,
  };
}

/**
 * Evaluates a composite rule spec against an email, returning whether it
 * matches and per-condition detail for debug output.
 *
 * Handles each spec version natively so that V3-specific fields
 * (emailIsRead, emailAttachment, etc.) are not silently discarded via
 * specToV2. V3-only conditions not yet reflected in EmailMetadata pass
 * by default until the interface is extended.
 */
export function evaluateComposite(
  spec: CompositeCategoryRuleSpec,
  email: EmailMetadata,
  normaliseSender: (raw: string) => string,
): { matches: boolean; detail: CompositeRuleEvaluationDetail } {
  const {
    senderPatterns,
    subjectPhrases,
    bodyPhrases,
    subjectNotPhrases,
    bodyNotPhrases,
  } = resolveSpecFields(spec);

  const normFrom = normaliseSender(email.from);

  let senderOk = false;
  let senderMatchedValue: string | null = null;
  for (const sender of senderPatterns) {
    if (senderMatchesPattern(normFrom, normaliseSender(sender))) {
      senderOk = true;
      senderMatchedValue = sender;
      break;
    }
  }

  const subj = (email.subject || "").toLowerCase();
  let subjectOk = false;
  let subjectMatchedValue: string | null = null;
  for (const phrase of subjectPhrases) {
    const needle = phrase.trim().toLowerCase();
    if (needle.length > 0 && subj.includes(needle)) {
      subjectOk = true;
      subjectMatchedValue = phrase;
      break;
    }
  }

  const body = (email.bodyTextForMatch || "").toLowerCase();
  const phrases = bodyPhrases.map((phrase) => phrase.trim()).filter(Boolean);
  let bodyMatchedPhrase: string | null = null;
  const bodyOk = phrases.some((phrase) => {
    const lowerPhrase = phrase.toLowerCase();
    if (lowerPhrase && body.includes(lowerPhrase)) {
      bodyMatchedPhrase = phrase;
      return true;
    }
    return false;
  });

  // Issue #1789: NOT-contains exclusions disqualify the rule even when the
  // positive conditions match.
  const subjectExcludedMatch = findExcludedPhrase(subjectNotPhrases, subj);
  const bodyExcludedMatch = findExcludedPhrase(bodyNotPhrases, body);
  const exclusionOk =
    subjectExcludedMatch === null && bodyExcludedMatch === null;

  return {
    matches: senderOk && subjectOk && bodyOk && exclusionOk,
    detail: {
      senderMatch: senderOk,
      subjectMatch: subjectOk,
      bodyMatch: bodyOk,
      bodyMatchedPhrase,
      senderMatchedValue,
      subjectMatchedValue,
      subjectExcludedMatch,
      bodyExcludedMatch,
    },
  };
}
