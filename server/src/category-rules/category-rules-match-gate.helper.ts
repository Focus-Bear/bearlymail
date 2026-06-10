/**
 * Pre-persist quality gate helpers for composite category rules.
 *
 * A rule is only worth keeping if it actually matches real email in the
 * user's mailbox. Earlier validation (issue #1789) only ran against
 * *categorised* threads and bypassed entirely when the user had no
 * categorised history — which let zero-match rules be created. These helpers
 * scan the most recent emails regardless of category so a rule that matches
 * nothing is discarded.
 */
import { Repository } from "typeorm";

import { CATEGORY_RULE_COMPOSITE } from "../constants/category-rule-composite.constants";
import {
  CompositeCategoryRuleSpec,
  CompositeCategoryRuleSpecV3,
} from "../database/entities/category-rule.entity";
import { Email } from "../database/entities/email.entity";
import { buildRuleMatchText } from "../llm/email-content-cleaner";
import {
  evaluateComposite,
  specToV2,
} from "./category-rules-auto-composite.helper";

/** A single email reduced to the fields needed for composite matching. */
export type MatchScanRow = Pick<
  Email,
  "from" | "subject" | "body" | "htmlBody"
>;

/**
 * Caches the cleaned match text per row so repeated `countMatchesInRows`
 * calls against the same rows (one per candidate spec) avoid re-running the
 * HTML-stripping pipeline. Keyed by the row object so entries are GC'd with
 * the row.
 */
const cleanedBodyCache = new WeakMap<MatchScanRow, string>();

function getCleanedBodyForMatch(row: MatchScanRow): string {
  const cached = cleanedBodyCache.get(row);
  if (cached !== undefined) return cached;
  const cleaned = buildRuleMatchText(row.body, row.htmlBody);
  cleanedBodyCache.set(row, cleaned);
  return cleaned;
}

/**
 * Fetches the user's most recent emails for in-memory match scanning. Email
 * fields are auto-decrypted by the TypeORM transformer when read through the
 * repository, so no manual decryption is needed. Fetch once and reuse across
 * multiple `countMatchesInRows` calls to avoid re-querying.
 */
export async function fetchRecentEmailsForMatching(
  emailRepository: Repository<Email>,
  userId: string,
  scanCount: number = CATEGORY_RULE_COMPOSITE.MATCH_GATE_SCAN_COUNT,
): Promise<MatchScanRow[]> {
  return emailRepository.find({
    where: { userId },
    order: { receivedAt: "DESC" },
    take: scanCount,
    select: {
      from: true,
      subject: true,
      body: true,
      htmlBody: true,
    },
  });
}

/** Counts how many of the pre-fetched rows the spec matches. */
export function countMatchesInRows(
  rows: MatchScanRow[],
  spec: CompositeCategoryRuleSpec,
  normaliseSender: (raw: string) => string,
): number {
  let matches = 0;
  for (const row of rows) {
    const result = evaluateComposite(
      spec,
      {
        from: row.from || "",
        subject: row.subject || "",
        bodyTextForMatch: getCleanedBodyForMatch(row),
      },
      normaliseSender,
    );
    if (result.matches) {
      matches += 1;
    }
  }
  return matches;
}

export interface CountMailboxMatchesParams {
  emailRepository: Repository<Email>;
  userId: string;
  spec: CompositeCategoryRuleSpec;
  normaliseSender: (raw: string) => string;
  /** Defaults to MATCH_GATE_SCAN_COUNT when omitted. */
  scanCount?: number;
}

/**
 * Convenience wrapper: fetches recent emails and counts how many the spec
 * matches in one call. Prefer the fetch-once + count-many split when the
 * same emails are scanned against multiple specs.
 */
export async function countMailboxMatchesForSpec(
  params: CountMailboxMatchesParams,
): Promise<number> {
  const { emailRepository, userId, spec, normaliseSender, scanCount } = params;
  const rows = await fetchRecentEmailsForMatching(
    emailRepository,
    userId,
    scanCount,
  );
  return countMatchesInRows(rows, spec, normaliseSender);
}

/** True when the spec carries at least one subject or body NOT-contains phrase. */
export function specHasExclusion(spec: CompositeCategoryRuleSpec): boolean {
  const v2 = specToV2(spec);
  return (
    (v2.subjectNotContainsAny?.length ?? 0) > 0 ||
    (v2.bodyNotContainsAny?.length ?? 0) > 0
  );
}

/** Lower-cased, trimmed set of phrases for case-insensitive overlap checks. */
function phraseKeySet(phrases: string[]): Set<string> {
  return new Set(phrases.map((phrase) => phrase.trim().toLowerCase()));
}

/**
 * Removes any NOT-contains phrase that is identical (case-insensitive) to a
 * contains phrase in the same field. Such a phrase is self-contradictory: any
 * email matching the positive condition would be excluded by the same text, so
 * the positive phrase can never win. We keep the positive phrases and drop the
 * contradictory exclusions (preserving the rule's other, valid exclusions).
 *
 * Returns the spec unchanged when there is no overlap. Always returns a v3 spec
 * when a change is made so the result can carry the trimmed exclusion arrays.
 */
export function dropContradictoryExclusions(
  spec: CompositeCategoryRuleSpec,
): CompositeCategoryRuleSpec {
  const v2 = specToV2(spec);
  const subjectContainsKeys = phraseKeySet(v2.subjectContainsAny);
  const bodyContainsKeys = phraseKeySet(v2.bodyContainsAny);

  const subjectNot = (v2.subjectNotContainsAny ?? []).filter(
    (phrase) => !subjectContainsKeys.has(phrase.trim().toLowerCase()),
  );
  const bodyNot = (v2.bodyNotContainsAny ?? []).filter(
    (phrase) => !bodyContainsKeys.has(phrase.trim().toLowerCase()),
  );

  const subjectChanged =
    subjectNot.length !== (v2.subjectNotContainsAny?.length ?? 0);
  const bodyChanged = bodyNot.length !== (v2.bodyNotContainsAny?.length ?? 0);
  if (!subjectChanged && !bodyChanged) {
    return spec;
  }

  return {
    v: 3,
    fromMatchesAny: v2.senderMatchesAny,
    subjectContainsAny: v2.subjectContainsAny,
    bodyContainsAny: v2.bodyContainsAny,
    ...(subjectNot.length > 0 && { subjectNotContainsAny: subjectNot }),
    ...(bodyNot.length > 0 && { bodyNotContainsAny: bodyNot }),
    ...(spec.v === 3 &&
      spec.emailIsRead !== undefined && { emailIsRead: spec.emailIsRead }),
    ...(spec.v === 3 &&
      spec.emailAttachment !== undefined && {
        emailAttachment: spec.emailAttachment,
      }),
    ...(spec.v === 3 &&
      spec.emailReceived !== undefined && {
        emailReceived: spec.emailReceived,
      }),
    ...(spec.v === 3 &&
      spec.emailRead !== undefined && { emailRead: spec.emailRead }),
  };
}

/** De-duplicates, trims, drops empties, and caps a phrase list. */
function cleanPhrases(phrases: string[], cap: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of phrases) {
    const phrase = raw.trim();
    if (!phrase) continue;
    const key = phrase.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(phrase);
    if (out.length >= cap) break;
  }
  return out;
}

/**
 * Returns a copy of `spec` with the given exclusion phrases merged into the
 * existing ones (deduped and capped). Always returns a v3 spec so the result
 * can carry exclusions regardless of the input version.
 */
export function mergeExclusionsIntoSpec(
  spec: CompositeCategoryRuleSpec,
  subjectNotContainsAny: string[],
  bodyNotContainsAny: string[],
): CompositeCategoryRuleSpecV3 {
  const v2 = specToV2(spec);
  const mergedSubjectNot = cleanPhrases(
    [...(v2.subjectNotContainsAny ?? []), ...subjectNotContainsAny],
    CATEGORY_RULE_COMPOSITE.MAX_SUBJECT_NOT_PHRASES,
  );
  const mergedBodyNot = cleanPhrases(
    [...(v2.bodyNotContainsAny ?? []), ...bodyNotContainsAny],
    CATEGORY_RULE_COMPOSITE.MAX_BODY_NOT_PHRASES,
  );

  return {
    v: 3,
    fromMatchesAny: v2.senderMatchesAny,
    subjectContainsAny: v2.subjectContainsAny,
    bodyContainsAny: v2.bodyContainsAny,
    ...(mergedSubjectNot.length > 0 && {
      subjectNotContainsAny: mergedSubjectNot,
    }),
    ...(mergedBodyNot.length > 0 && { bodyNotContainsAny: mergedBodyNot }),
    ...(spec.v === 3 &&
      spec.emailIsRead !== undefined && { emailIsRead: spec.emailIsRead }),
    ...(spec.v === 3 &&
      spec.emailAttachment !== undefined && {
        emailAttachment: spec.emailAttachment,
      }),
    ...(spec.v === 3 &&
      spec.emailReceived !== undefined && {
        emailReceived: spec.emailReceived,
      }),
    ...(spec.v === 3 &&
      spec.emailRead !== undefined && { emailRead: spec.emailRead }),
  };
}
