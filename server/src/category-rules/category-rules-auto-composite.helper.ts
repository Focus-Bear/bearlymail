import { CATEGORY_RULE_COMPOSITE } from "../constants/category-rule-composite.constants";
import {
  CompositeCategoryRuleSpecV1,
  CompositeCategoryRuleSpecV2,
} from "../database/entities/category-rule.entity";
import type { CompositeRuleEvaluationDetail, EmailMetadata } from "./category-rules.types";

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

export function compositeAutoSpecsMatch(
  first: CompositeCategoryRuleSpecV2,
  second: CompositeCategoryRuleSpecV2,
): boolean {
  const packStrings = (values: string[]) =>
    [...values]
      .map((item) => item.trim())
      .sort()
      .join("\u0001");
  return (
    packStrings(first.senderMatchesAny) ===
      packStrings(second.senderMatchesAny) &&
    packStrings(first.subjectContainsAny) ===
      packStrings(second.subjectContainsAny) &&
    packStrings(first.bodyContainsAny) === packStrings(second.bodyContainsAny)
  );
}

/** Normalise a v1 spec into the v2 array shape for unified evaluation. */
export function specToV2(
  spec: CompositeCategoryRuleSpecV1 | CompositeCategoryRuleSpecV2,
): CompositeCategoryRuleSpecV2 {
  if (spec.v === 2) {
    return spec;
  }
  return {
    v: 2,
    senderMatchesAny: [spec.sender],
    subjectContainsAny: [spec.subjectContains],
    bodyContainsAny: spec.bodyContainsAny,
  };
}

/**
 * Evaluates a composite rule spec against an email, returning whether it
 * matches and per-condition detail for debug output.
 */
export function evaluateComposite(
  spec: CompositeCategoryRuleSpecV1 | CompositeCategoryRuleSpecV2,
  email: EmailMetadata,
  normaliseSender: (raw: string) => string,
): { matches: boolean; detail: CompositeRuleEvaluationDetail } {
  const v2 = specToV2(spec);
  const normFrom = normaliseSender(email.from);

  let senderOk = false;
  let senderMatchedValue: string | null = null;
  for (const sender of v2.senderMatchesAny) {
    if (normaliseSender(sender) === normFrom) {
      senderOk = true;
      senderMatchedValue = sender;
      break;
    }
  }

  const subj = (email.subject || "").toLowerCase();
  let subjectOk = false;
  let subjectMatchedValue: string | null = null;
  for (const phrase of v2.subjectContainsAny) {
    const needle = phrase.trim().toLowerCase();
    if (needle.length > 0 && subj.includes(needle)) {
      subjectOk = true;
      subjectMatchedValue = phrase;
      break;
    }
  }

  const body = (email.bodyTextForMatch || "").toLowerCase();
  const phrases = v2.bodyContainsAny.map((phrase) => phrase.trim()).filter(Boolean);
  let bodyMatchedPhrase: string | null = null;
  const bodyOk = phrases.some((phrase) => {
    const lowerPhrase = phrase.toLowerCase();
    if (lowerPhrase && body.includes(lowerPhrase)) {
      bodyMatchedPhrase = phrase;
      return true;
    }
    return false;
  });

  return {
    matches: senderOk && subjectOk && bodyOk,
    detail: {
      senderMatch: senderOk,
      subjectMatch: subjectOk,
      bodyMatch: bodyOk,
      bodyMatchedPhrase,
      senderMatchedValue,
      subjectMatchedValue,
    },
  };
}
