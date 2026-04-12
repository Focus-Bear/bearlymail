/**
 * Helpers for the "Suggest rules for me" feature (issue #1714).
 *
 * Extracted into a separate file so that `category-rules.service.ts` stays
 * within the 800-line lint limit and `suggestCategoryRules` stays within the
 * 30-statement limit.
 */
import { Repository } from "typeorm";

import { CATEGORY_RULE_COMPOSITE } from "../constants/category-rule-composite.constants";
import { BODY_PREVIEW_LENGTHS } from "../constants/llm-constants";
import { CategoryRule } from "../database/entities/category-rule.entity";
import { Email } from "../database/entities/email.entity";
import { cleanEmailContent } from "../llm/email-content-cleaner";
import { computeEmailHmac } from "../utils/hmac-email";
import {
  pickAutoCompositeBodyPhrase,
  pickAutoCompositeSubjectPhrase,
} from "./category-rules-auto-composite.helper";
import type { CategoryRuleSuggestion } from "./category-rules.types";

/** Raw row returned by the thread-count aggregation query. */
interface ThreadCountRow {
  hmac: string;
  threadCount: string;
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
 * Returns true when the given normalised sender address is already covered by
 * an existing composite rule for this user.
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
    const senders =
      spec.v === 2 ? spec.senderMatchesAny : [spec.sender];
    return senders.some(
      (sender) => normaliseSender(sender) === normalisedSender,
    );
  });
}

/**
 * Builds a single CategoryRuleSuggestion from a batch of sample emails
 * for one sender. Returns null when not enough signal can be extracted.
 */
export function buildSuggestionFromSamples(
  normalisedSender: string,
  sampleEmails: Pick<Email, "subject" | "body">[],
  threadCount: number,
  categoryName: string,
): CategoryRuleSuggestion | null {
  const subjectPhrases = new Set<string>();
  const bodyPhrases = new Set<string>();

  for (const email of sampleEmails) {
    const subject = (email.subject || "").trim();
    if (subject) {
      const phrase = pickAutoCompositeSubjectPhrase(subject);
      if (phrase) {
        subjectPhrases.add(phrase);
      }
    }

    const bodyText = cleanEmailContent(
      email.body || "",
      null,
      BODY_PREVIEW_LENGTHS.CLASSIFICATION_PREVIEW,
    );
    const bodyPhrase = pickAutoCompositeBodyPhrase(bodyText || undefined);
    if (bodyPhrase) {
      bodyPhrases.add(bodyPhrase);
    }
  }

  if (subjectPhrases.size === 0 || bodyPhrases.size === 0) {
    return null;
  }

  return {
    sender: normalisedSender,
    categoryName,
    suggestedSubjectPhrases: Array.from(subjectPhrases).slice(
      0,
      CATEGORY_RULE_COMPOSITE.MAX_SUBJECT_PHRASES,
    ),
    suggestedBodyPhrases: Array.from(bodyPhrases).slice(
      0,
      CATEGORY_RULE_COMPOSITE.MAX_BODY_PHRASES,
    ),
    threadCount,
  };
}

/**
 * Full suggest pipeline: finds candidate senders, filters out those already
 * covered by composite rules, builds suggestion objects from sampled emails.
 */
export async function buildSuggestions(
  emailRepository: Repository<Email>,
  ruleRepository: Repository<CategoryRule>,
  userId: string,
  categoryNameFilter: string,
  normaliseSender: (raw: string) => string,
): Promise<CategoryRuleSuggestion[]> {
  const candidateRows = await fetchCandidateSenderRows(
    emailRepository,
    userId,
  );
  if (candidateRows.length === 0) {
    return [];
  }

  const existingRules = await ruleRepository.find({
    where: { userId, ruleKind: "composite" },
    select: ["compositeSpec"],
  });

  const suggestions: CategoryRuleSuggestion[] = [];

  for (const row of candidateRows) {
    if (suggestions.length >= CATEGORY_RULE_COMPOSITE.SUGGEST_MAX_RESULTS) {
      break;
    }

    const sampleEmails = await emailRepository.find({
      where: { userId, senderEmailHmac: row.hmac },
      order: { receivedAt: "DESC" },
      take: CATEGORY_RULE_COMPOSITE.SUGGEST_SAMPLE_EMAILS_PER_SENDER,
      select: ["from", "subject", "body"],
    });

    if (sampleEmails.length === 0) {
      continue;
    }

    const normalisedSender = normaliseSender(sampleEmails[0].from);
    if (!normalisedSender) {
      continue;
    }

    if (isSenderAlreadyCovered(normalisedSender, existingRules, normaliseSender)) {
      continue;
    }

    const suggestion = buildSuggestionFromSamples(
      normalisedSender,
      sampleEmails,
      parseInt(row.threadCount, 10),
      categoryNameFilter,
    );
    if (suggestion) {
      suggestions.push(suggestion);
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