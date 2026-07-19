import type { EmailMetadata } from "../category-rules/category-rules.types";
import {
  senderMatchesPattern,
  specToV2,
} from "../category-rules/category-rules-auto-composite.helper";
import type { CompositeCategoryRuleSpec } from "../database/entities/category-rule.entity";

/**
 * Evaluates a priority rule's composite spec against an email.
 *
 * Deliberately NOT the category `evaluateComposite`: priority rules are
 * sender-anchored, so an empty subject/body phrase list means "no constraint on
 * this field" (wildcard) rather than "never match". This lets a rule cover all
 * of a sender's mail when their priority is consistent, while still allowing
 * subject/body phrases (and NOT-contains exclusions) to narrow a rule when a
 * sender's mail splits across bands. Sender-wildcard handling and spec-version
 * normalisation are reused from the category helper so matching stays in lock
 * step with category rules.
 */
export function evaluatePriorityRule(
  spec: CompositeCategoryRuleSpec,
  email: EmailMetadata,
  normaliseSender: (raw: string) => string,
): boolean {
  const v2 = specToV2(spec);
  const normFrom = normaliseSender(email.from);

  const senderMatches = v2.senderMatchesAny ?? [];
  const senderOk =
    senderMatches.length === 0 ||
    senderMatches.some((pattern) =>
      senderMatchesPattern(normFrom, normaliseSender(pattern)),
    );
  if (!senderOk) return false;

  const subject = (email.subject || "").toLowerCase();
  const subjectOk = containsAnyOrEmpty(v2.subjectContainsAny, subject);
  if (!subjectOk) return false;

  const body = (email.bodyTextForMatch || "").toLowerCase();
  const bodyOk = containsAnyOrEmpty(v2.bodyContainsAny, body);
  if (!bodyOk) return false;

  // Exclusions disqualify the rule even when positive conditions match.
  if (containsAny(v2.subjectNotContainsAny, subject)) return false;
  if (containsAny(v2.bodyNotContainsAny, body)) return false;

  return true;
}

/** True when the phrase list is empty/blank, or any phrase is in `haystack`. */
function containsAnyOrEmpty(
  phrases: string[] | undefined,
  haystackLower: string,
): boolean {
  const cleaned = (phrases ?? [])
    .map((phrase) => phrase.trim().toLowerCase())
    .filter(Boolean);
  return (
    cleaned.length === 0 ||
    cleaned.some((phrase) => haystackLower.includes(phrase))
  );
}

/** True when any non-blank phrase is present in `haystack`. */
function containsAny(
  phrases: string[] | undefined,
  haystackLower: string,
): boolean {
  return (phrases ?? []).some((phrase) => {
    const needle = phrase.trim().toLowerCase();
    return needle.length > 0 && haystackLower.includes(needle);
  });
}
