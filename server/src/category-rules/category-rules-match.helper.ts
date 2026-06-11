/**
 * Pure rule-matching helpers extracted from `CategoryRulesService` so the
 * service stays under its line budget. Shared by both `peekMatchingRule` and
 * the trace-emitting `findMatchingRuleWithTrace`.
 */
import {
  CATEGORY_RULE_KINDS,
  CATEGORY_RULE_MATCH_MODES,
} from "../constants/domain-types";
import { SearchIndexHelper } from "../contacts/search-index.helper";
import { CategoryRule } from "../database/entities/category-rule.entity";
import type { CategoryRuleMatch, EmailMetadata } from "./category-rules.types";
import {
  EmailHashes,
  evaluateComposite,
} from "./category-rules-auto-composite.helper";
import { compositeSpecIsSupported } from "./category-rules-trace.helper";

type NormaliseSender = (raw: string) => string;
type ExtractDomain = (from: string) => string | null;
type ExtractSubjectPrefix = (subject: string) => string | null;

export function buildEmailHashes(
  email: EmailMetadata,
  normaliseSender: NormaliseSender,
  extractDomain: ExtractDomain,
  extractSubjectPrefix: ExtractSubjectPrefix,
): EmailHashes {
  const normalisedSender = normaliseSender(email.from);
  const domain = extractDomain(email.from);
  const subjectPrefix = extractSubjectPrefix(email.subject);
  const senderHash = SearchIndexHelper.hashExact(normalisedSender);
  const domainPattern = domain ? `@${domain}` : null;
  const domainHash = domainPattern
    ? SearchIndexHelper.hashExact(domainPattern)
    : null;
  const prefixHash = subjectPrefix
    ? SearchIndexHelper.hashExact(subjectPrefix.toLowerCase())
    : null;
  return { senderHash, domainPattern, domainHash, subjectPrefix, prefixHash };
}

export function findFirstCompositeRuleMatch(
  rules: CategoryRule[],
  email: EmailMetadata,
  normaliseSender: NormaliseSender,
): CategoryRuleMatch | null {
  for (const rule of rules) {
    if (rule.ruleKind !== CATEGORY_RULE_MATCH_MODES.COMPOSITE) {
      continue;
    }
    if (!compositeSpecIsSupported(rule.compositeSpec)) {
      continue;
    }
    const { matches } = evaluateComposite(
      rule.compositeSpec,
      email,
      normaliseSender,
    );
    if (matches) {
      return {
        categoryName: rule.categoryName,
        categoryId: rule.categoryId,
        ruleId: rule.id,
        ruleType: null,
        ruleKind: "composite",
      };
    }
  }
  return null;
}

export function findLegacyRuleMatch(
  rules: CategoryRule[],
  hashes: EmailHashes,
): CategoryRuleMatch | null {
  const legacyRules = rules.filter(
    (rule) =>
      rule.ruleKind === CATEGORY_RULE_KINDS.LEGACY &&
      rule.ruleType != null &&
      rule.patternHash != null,
  );

  const ruleMap = new Map<string, CategoryRule>();
  for (const rule of legacyRules) {
    ruleMap.set(`${rule.ruleType}:${rule.patternHash}`, rule);
  }

  return lookupLegacyRuleInMap(ruleMap, hashes);
}

function lookupLegacyRuleInMap(
  ruleMap: Map<string, CategoryRule>,
  hashes: EmailHashes,
): CategoryRuleMatch | null {
  const { senderHash, domainPattern, domainHash, subjectPrefix, prefixHash } =
    hashes;

  const toLegacyMatch = (rule: CategoryRule): CategoryRuleMatch => ({
    categoryName: rule.categoryName,
    categoryId: rule.categoryId,
    ruleId: rule.id,
    ruleType: rule.ruleType,
    ruleKind: "legacy",
  });

  const exactMatch = ruleMap.get(`exact_sender:${senderHash}`);
  if (exactMatch) {
    return toLegacyMatch(exactMatch);
  }

  if (domainPattern && subjectPrefix) {
    const combinedHashInput = `${domainPattern.toLowerCase()}|${subjectPrefix.toLowerCase()}`;
    const combinedHash = SearchIndexHelper.hashExact(combinedHashInput);
    const combinedMatch = ruleMap.get(
      `sender_domain_and_subject_prefix:${combinedHash}`,
    );
    if (combinedMatch) {
      return toLegacyMatch(combinedMatch);
    }
  }

  if (domainHash) {
    const domainMatch = ruleMap.get(`sender_domain:${domainHash}`);
    if (domainMatch) {
      return toLegacyMatch(domainMatch);
    }
  }

  if (prefixHash) {
    const prefixMatch = ruleMap.get(`subject_prefix:${prefixHash}`);
    if (prefixMatch) {
      return toLegacyMatch(prefixMatch);
    }
  }

  return null;
}
