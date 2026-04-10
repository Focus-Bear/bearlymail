import { CATEGORY_RULE_COMPOSITE } from "../constants/category-rule-composite.constants";
import { CompositeCategoryRuleSpecV2 } from "../database/entities/category-rule.entity";

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
