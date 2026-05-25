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
import {
  evaluateComposite,
  specToV2,
} from "./category-rules-auto-composite.helper";

/** A single email reduced to the fields needed for composite matching. */
export type MatchScanRow = Pick<Email, "from" | "subject" | "body">;

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
    select: ["from", "subject", "body"],
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
        bodyTextForMatch: row.body || "",
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
      spec.emailAttachment && { emailAttachment: spec.emailAttachment }),
    ...(spec.v === 3 &&
      spec.emailReceived && { emailReceived: spec.emailReceived }),
    ...(spec.v === 3 && spec.emailRead && { emailRead: spec.emailRead }),
  };
}
