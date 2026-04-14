/**
 * Helpers for the "Suggest rules for me" feature (issue #1714).
 *
 * Extracted into a separate file so that `category-rules.service.ts` stays
 * within the 800-line lint limit and `suggestCategoryRules` stays within the
 * 30-statement limit.
 */
import { Repository } from "typeorm";

import { CATEGORY_RULE_COMPOSITE } from "../constants/category-rule-composite.constants";
import { CategoryRule } from "../database/entities/category-rule.entity";
import { Email } from "../database/entities/email.entity";
import { LLMCategoriesService } from "../llm/llm-categories.service";
import { computeEmailHmac } from "../utils/hmac-email";
import { senderMatchesPattern } from "./category-rules-auto-composite.helper";
import type { CategoryRuleSuggestion } from "./category-rules.types";

/** Raw row returned by the thread-count aggregation query. */
interface ThreadCountRow {
  hmac: string;
  threadCount: string;
}

/** Resolved sender info for a candidate sender row. */
interface CandidateInfo {
  hmac: string;
  normSender: string;
  domain: string | null;
  threadCount: number;
}

/**
 * Fetches senders that have >= SUGGEST_MIN_THREAD_COUNT distinct threads.
 * Results are ordered by thread count descending and capped at
 * SUGGEST_MAX_RESULTS * 3 to allow for filtering before the final limit.
 */
export async function fetchCandidateSenderRows(
  emailRepository: Repository<Email>,
  userId: string,
): Promise<ThreadCountRow[]> {
  return emailRepository
    .createQueryBuilder("email")
    .select("email.senderEmailHmac", "hmac")
    .addSelect("COUNT(DISTINCT email.threadId)", "threadCount")
    .where("email.userId = :userId", { userId })
    .andWhere("email.senderEmailHmac IS NOT NULL")
    .groupBy("email.senderEmailHmac")
    .having("COUNT(DISTINCT email.threadId) >= :min", {
      min: CATEGORY_RULE_COMPOSITE.SUGGEST_MIN_THREAD_COUNT,
    })
    .orderBy("COUNT(DISTINCT email.threadId)", "DESC")
    .limit(CATEGORY_RULE_COMPOSITE.SUGGEST_MAX_RESULTS * 3)
    .getRawMany<ThreadCountRow>();
}

/**
 * Extracts the domain part from a normalised sender address.
 * Returns null when the address contains no `@`.
 */
export function extractSenderDomain(normalisedSender: string): string | null {
  const atIdx = normalisedSender.indexOf("@");
  if (atIdx < 0) return null;
  return normalisedSender.slice(atIdx + 1).toLowerCase();
}

/**
 * Returns true when the given normalised sender address is already covered by
 * an existing composite rule for this user.
 * Supports domain wildcard patterns (e.g. `*@github.com`) stored in rule specs.
 */
export function isSenderAlreadyCovered(
  normalisedSender: string,
  existingRules: Pick<CategoryRule, "compositeSpec">[],
  normaliseSender: (raw: string) => string,
): boolean {
  return existingRules.some((rule) => {
    if (!rule.compositeSpec) {
      return false;
    }
    const spec = rule.compositeSpec;
    const senders = spec.v === 2 ? spec.senderMatchesAny : [spec.sender];
    return senders.some((sender) =>
      senderMatchesPattern(normalisedSender, normaliseSender(sender)),
    );
  });
}

/**
 * Returns true when `normalisedSender` is covered by any of the provided
 * patterns. Supports domain wildcards (`*@domain.com`).
 */
function isCoveredByPatterns(
  normalisedSender: string,
  patterns: string[],
): boolean {
  return patterns.some((pattern) =>
    senderMatchesPattern(normalisedSender, pattern),
  );
}

/**
 * Builds a single CategoryRuleSuggestion from a batch of sample emails
 * for one or more senders, using the LLM to extract SHORT, GENERIC phrases
 * and decide on the sender pattern (may be a domain wildcard).
 * Returns null when the LLM cannot identify usable patterns.
 */
export async function buildSuggestionFromSamplesWithLLM(
  senderEmails: string[],
  sampleEmails: Pick<Email, "subject" | "body">[],
  threadCount: number,
  categoryName: string,
  llmCategoriesService: LLMCategoriesService,
): Promise<CategoryRuleSuggestion | null> {
  const samples = sampleEmails.map((email) => ({
    subject: email.subject || "",
    body: email.body || "",
  }));

  const result = await llmCategoriesService.suggestRulesFromEmailSamples(
    categoryName,
    senderEmails,
    samples,
  );

  if (!result) {
    return null;
  }

  const { fromMatchesAny, subjectContainsAny, bodyContainsAny } = result;

  if (
    fromMatchesAny.length === 0 ||
    subjectContainsAny.length === 0 ||
    bodyContainsAny.length === 0
  ) {
    return null;
  }

  return {
    sender: fromMatchesAny[0],
    suggestedSenderPatterns: fromMatchesAny,
    categoryName,
    suggestedSubjectPhrases: subjectContainsAny.slice(
      0,
      CATEGORY_RULE_COMPOSITE.MAX_SUBJECT_PHRASES,
    ),
    suggestedBodyPhrases: bodyContainsAny.slice(
      0,
      CATEGORY_RULE_COMPOSITE.MAX_BODY_PHRASES,
    ),
    threadCount,
  };
}

/**
 * Full suggest pipeline: finds candidate senders, groups them by domain so
 * that multiple addresses from the same domain (e.g. notifications@github.com
 * and actions@github.com) are presented as a single suggestion with a domain
 * wildcard pattern. Filters out senders already covered by composite rules.
 */
export async function buildSuggestions(
  repositories: { email: Repository<Email>; rule: Repository<CategoryRule> },
  userId: string,
  categoryNameFilter: string,
  normaliseSender: (raw: string) => string,
  llmCategoriesService: LLMCategoriesService,
): Promise<CategoryRuleSuggestion[]> {
  const candidateRows = await fetchCandidateSenderRows(
    repositories.email,
    userId,
  );
  if (candidateRows.length === 0) {
    return [];
  }

  // Resolve the normalised sender for each candidate by fetching one probe
  // email per HMAC (all emails with the same HMAC share the same sender).
  const resolved = await Promise.all(
    candidateRows.map(async (row) => {
      const probe = await repositories.email.findOne({
        where: { userId, senderEmailHmac: row.hmac },
        select: ["from"],
      });
      if (!probe) return null;
      const normSender = normaliseSender(probe.from);
      if (!normSender) return null;
      return {
        hmac: row.hmac,
        normSender,
        domain: extractSenderDomain(normSender),
        threadCount: parseInt(row.threadCount, 10),
      };
    }),
  );

  const resolvedCandidates = resolved.filter(
    (candidate): candidate is CandidateInfo => candidate !== null,
  );

  // Group candidates by domain so that senders sharing a domain are processed
  // together and can receive a single domain-wildcard suggestion.
  const domainGroups = new Map<string, CandidateInfo[]>();
  for (const candidate of resolvedCandidates) {
    const key = candidate.domain ?? candidate.normSender;
    const group = domainGroups.get(key) ?? [];
    group.push(candidate);
    domainGroups.set(key, group);
  }

  const existingRules = await repositories.rule.find({
    where: { userId, ruleKind: "composite" },
    select: ["compositeSpec"],
  });

  const suggestions: CategoryRuleSuggestion[] = [];
  // Track sender patterns from newly added suggestions so that domain-sibling
  // candidates (e.g. actions@github.com after *@github.com is added) are skipped.
  const addedPatterns: string[] = [];

  for (const [, group] of domainGroups) {
    if (suggestions.length >= CATEGORY_RULE_COMPOSITE.SUGGEST_MAX_RESULTS) {
      break;
    }

    const senderEmails = [...new Set(group.map((candidate) => candidate.normSender))];
    const totalThreadCount = group.reduce(
      (sum, candidate) => sum + candidate.threadCount,
      0,
    );

    // Skip if every sender in this group is already covered by a DB rule or
    // by a wildcard pattern we just added in this run.
    const allCovered = senderEmails.every(
      (sender) =>
        isSenderAlreadyCovered(sender, existingRules, normaliseSender) ||
        isCoveredByPatterns(sender, addedPatterns),
    );
    if (allCovered) {
      continue;
    }

    // Collect sample emails from all HMACs in this domain group (parallel).
    const allSampleEmails = (
      await Promise.all(
        group.map(({ hmac }) =>
          repositories.email.find({
            where: { userId, senderEmailHmac: hmac },
            order: { receivedAt: "DESC" },
            take: CATEGORY_RULE_COMPOSITE.SUGGEST_SAMPLE_EMAILS_PER_SENDER,
            select: ["from", "subject", "body"],
          }),
        ),
      )
    ).flat();

    if (allSampleEmails.length === 0) {
      continue;
    }

    const suggestion = await buildSuggestionFromSamplesWithLLM(
      senderEmails,
      allSampleEmails,
      totalThreadCount,
      categoryNameFilter,
      llmCategoriesService,
    );
    if (suggestion) {
      suggestions.push(suggestion);
      // Track the suggested sender patterns so siblings are skipped.
      addedPatterns.push(...suggestion.suggestedSenderPatterns);
    }
  }

  return suggestions;
}

/**
 * Counts distinct threads for a single sender HMAC using an indexed query.
 * Returns 0 when the sender has no HMAC or no emails in the database.
 */
export async function countDistinctThreadsForSenderHmac(
  emailRepository: Repository<Email>,
  userId: string,
  senderAddress: string,
): Promise<number> {
  const hmac = computeEmailHmac(senderAddress);
  if (!hmac) {
    return 0;
  }
  const result = await emailRepository
    .createQueryBuilder("email")
    .select("COUNT(DISTINCT email.threadId)", "cnt")
    .where("email.userId = :userId", { userId })
    .andWhere("email.senderEmailHmac = :hmac", { hmac })
    .getRawOne<{ cnt: string }>();
  return parseInt(result?.cnt ?? "0", 10);
}
