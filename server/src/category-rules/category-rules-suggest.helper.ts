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
import { UserContext } from "../database/entities/user-context.entity";
import { LLMCategoriesService } from "../llm/llm-categories.service";
import { computeEmailHmac } from "../utils/hmac-email";
import type { CategoryRuleSuggestion } from "./category-rules.types";
import {
  senderMatchesPattern,
  specToV2,
} from "./category-rules-auto-composite.helper";
import { findCategoryContextIdByName } from "./category-rules-validate.helper";

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
 * When categoryId is provided, only threads categorised under that category
 * are counted — ensuring suggestions are relevant to the requested category
 * and different categories with the same sender domain get distinct patterns.
 *
 * Results are ordered by thread count descending and capped at
 * SUGGEST_MAX_RESULTS * 3 to allow for filtering before the final limit.
 */
export async function fetchCandidateSenderRows(
  emailRepository: Repository<Email>,
  userId: string,
  categoryId: string | null = null,
): Promise<ThreadCountRow[]> {
  const qb = emailRepository
    .createQueryBuilder("email")
    .select("email.senderEmailHmac", "hmac")
    .addSelect("COUNT(DISTINCT email.threadId)", "threadCount")
    .where("email.userId = :userId", { userId })
    .andWhere("email.senderEmailHmac IS NOT NULL");

  if (categoryId) {
    // Join to email_threads to filter by category. Using the table name string
    // (not the entity alias) avoids needing EmailThread in forFeature().
    qb.innerJoin(
      "email_threads",
      "thread",
      "thread.id = email.emailThreadId AND thread.categoryId = :categoryId",
      { categoryId },
    );
  }

  return qb
    .groupBy("email.senderEmailHmac")
    .having("COUNT(DISTINCT email.threadId) >= :min", {
      min: CATEGORY_RULE_COMPOSITE.SUGGEST_MIN_THREAD_COUNT,
    })
    .orderBy("COUNT(DISTINCT email.threadId)", "DESC")
    .limit(CATEGORY_RULE_COMPOSITE.SUGGEST_MAX_RESULTS * 3)
    .getRawMany<ThreadCountRow>();
}

/**
 * Fetches recent sample emails for a sender HMAC.
 * When categoryId is provided, only emails from threads categorised under
 * that category are returned, so the LLM sees category-relevant examples.
 */
async function fetchSampleEmails(
  emailRepository: Repository<Email>,
  userId: string,
  senderHmac: string,
  categoryId: string | null,
): Promise<Pick<Email, "from" | "subject" | "body">[]> {
  if (categoryId) {
    return emailRepository
      .createQueryBuilder("email")
      .select(["email.from", "email.subject", "email.body"])
      .innerJoin(
        "email_threads",
        "thread",
        "thread.id = email.emailThreadId AND thread.categoryId = :categoryId",
        { categoryId },
      )
      .where("email.userId = :userId", { userId })
      .andWhere("email.senderEmailHmac = :hmac", { hmac: senderHmac })
      .orderBy("email.receivedAt", "DESC")
      .take(CATEGORY_RULE_COMPOSITE.SUGGEST_SAMPLE_EMAILS_PER_SENDER)
      .getMany();
  }

  return emailRepository.find({
    where: { userId, senderEmailHmac: senderHmac },
    order: { receivedAt: "DESC" },
    take: CATEGORY_RULE_COMPOSITE.SUGGEST_SAMPLE_EMAILS_PER_SENDER,
    select: {
      from: true,
      subject: true,
      body: true,
    },
  });
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
    const senders = specToV2(spec).senderMatchesAny;
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

  const {
    fromMatchesAny,
    subjectContainsAny,
    bodyContainsAny,
    subjectNotContainsAny,
    bodyNotContainsAny,
  } = result;

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
    suggestedSubjectNotPhrases: subjectNotContainsAny.slice(
      0,
      CATEGORY_RULE_COMPOSITE.MAX_SUBJECT_NOT_PHRASES,
    ),
    suggestedBodyNotPhrases: bodyNotContainsAny.slice(
      0,
      CATEGORY_RULE_COMPOSITE.MAX_BODY_NOT_PHRASES,
    ),
    threadCount,
  };
}

/**
 * Groups resolved candidates by domain (or full address when there is no `@`),
 * so that multiple senders from the same domain are batched into one suggestion.
 */
function groupCandidatesByDomain(
  candidates: CandidateInfo[],
): Map<string, CandidateInfo[]> {
  const groups = new Map<string, CandidateInfo[]>();
  for (const candidate of candidates) {
    const key = candidate.domain ?? candidate.normSender;
    const group = groups.get(key) ?? [];
    group.push(candidate);
    groups.set(key, group);
  }
  return groups;
}

/**
 * Full suggest pipeline: finds candidate senders, groups them by domain so
 * that multiple addresses from the same domain (e.g. notifications@github.com
 * and actions@github.com) are presented as a single suggestion with a domain
 * wildcard pattern. Filters out senders already covered by composite rules.
 *
 * When categoryName is non-empty, only emails from threads already categorised
 * under that category are used as samples — ensuring the LLM generates patterns
 * that actually match the category's emails and preventing the same rule from
 * being generated for multiple categories that share a sender domain.
 */
export async function buildSuggestions(
  repositories: {
    email: Repository<Email>;
    rule: Repository<CategoryRule>;
    userContext: Repository<UserContext>;
  },
  userId: string,
  categoryNameFilter: string,
  normaliseSender: (raw: string) => string,
  llmCategoriesService: LLMCategoriesService,
): Promise<CategoryRuleSuggestion[]> {
  // Resolve the category's UUID so we can filter emails by category, using the
  // canonical parsed-name resolver ("Name - Description" contexts match on the
  // name portion; a private whole-value compare here used to silently return
  // null for every described category, degrading suggestions to all-email mode).
  // Returns null for empty filter (fallback: use all emails) or unknown names.
  const categoryId = await findCategoryContextIdByName(
    repositories.userContext,
    userId,
    categoryNameFilter,
  );

  const candidateRows = await fetchCandidateSenderRows(
    repositories.email,
    userId,
    categoryId,
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
        select: {
          from: true,
        },
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
  const domainGroups = groupCandidatesByDomain(resolvedCandidates);

  const existingRules = await repositories.rule.find({
    where: { userId, ruleKind: "composite" },
    select: {
      compositeSpec: true,
    },
  });

  const suggestions: CategoryRuleSuggestion[] = [];
  // Track sender patterns from newly added suggestions so that domain-sibling
  // candidates (e.g. actions@github.com after *@github.com is added) are skipped.
  const addedPatterns: string[] = [];

  for (const [, group] of domainGroups) {
    if (suggestions.length >= CATEGORY_RULE_COMPOSITE.SUGGEST_MAX_RESULTS) {
      break;
    }

    const senderEmails = [
      ...new Set(group.map((candidate) => candidate.normSender)),
    ];
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
    // When categoryId is set, only emails from that category's threads are used.
    const allSampleEmails = (
      await Promise.all(
        group.map(({ hmac }) =>
          fetchSampleEmails(repositories.email, userId, hmac, categoryId),
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
