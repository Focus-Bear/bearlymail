/**
 * Per-subtype true/false-positive breakdown of a sender's recent mail, used
 * when drafting a STRUCTURAL rule for a uniform-notification sender (GitHub).
 *
 * Instead of pinning only the seed email's sub-stream, the draft looks at which
 * fine sub-streams (`github:pr:comment:bot`, `github:pr:push:human`, …) actually
 * occur among the threads ALREADY filed under the target category from this
 * sender, and which of those also occur under OTHER categories. Sub-streams
 * that are clean (≥1 true positive, 0 false positives) become the rule's
 * subtype set; the whole breakdown is shown to the strong-model reviewer so it
 * can judge actor/event fit from evidence rather than guess from phrases.
 */
import { CATEGORY_RULE_COMPOSITE } from "../constants/category-rule-composite.constants";
import type { NotificationSubtypeBreakdownEntry } from "../llm/llm-rule-sanity";
import { resolveNotificationSubtype } from "../utils/notification-subtype.util";
import { senderMatchesPattern } from "./category-rules-auto-composite.helper";
import type { DecryptedValidationRow } from "./category-rules-validate.helper";

export interface SubtypeBreakdownParams {
  /** The target category's OWN recent threads (the dense true-positive window). */
  categoryRows: DecryptedValidationRow[];
  /** A broad recent sample of all categorised mail (the false-positive window). */
  broadRows: DecryptedValidationRow[];
  /** Sender patterns the rule will carry (exact or `*@domain` wildcards). */
  senderPatterns: string[];
  normaliseSender: (raw: string) => string;
  targetCategoryId: string | null;
}

/** Minimum true positives a sub-stream needs to be pinned by the drafted rule. */
const MIN_TRUE_POSITIVES_PER_SUBTYPE = 1;
/** False positives allowed per pinned sub-stream: none — precision is the point. */
const MAX_FALSE_POSITIVES_PER_SUBTYPE =
  CATEGORY_RULE_COMPOSITE.RULE_MAX_ACCEPTABLE_FP;

function rowSubtype(row: DecryptedValidationRow): string | null {
  return resolveNotificationSubtype({
    from: row.from,
    subject: row.subject,
    body: row.body,
    htmlBody: row.htmlBody,
  });
}

function rowMatchesSender(
  row: DecryptedValidationRow,
  senderPatterns: string[],
  normaliseSender: (raw: string) => string,
): boolean {
  const normFrom = normaliseSender(row.from);
  return senderPatterns.some((pattern) =>
    senderMatchesPattern(normFrom, normaliseSender(pattern)),
  );
}

/**
 * Counts, per resolved sub-stream of the sender's mail, how many threads sit in
 * the target category (true positives, from the dense category window) versus
 * in any other category (false positives, from the broad window). Sorted by
 * true positives descending so the strongest sub-streams come first.
 */
export function buildNotificationSubtypeBreakdown(
  params: SubtypeBreakdownParams,
): NotificationSubtypeBreakdownEntry[] {
  const {
    categoryRows,
    broadRows,
    senderPatterns,
    normaliseSender,
    targetCategoryId,
  } = params;
  const entries = new Map<string, NotificationSubtypeBreakdownEntry>();
  const entryFor = (subtype: string): NotificationSubtypeBreakdownEntry => {
    const existing = entries.get(subtype);
    if (existing) return existing;
    const created = { subtype, truePositives: 0, falsePositives: 0 };
    entries.set(subtype, created);
    return created;
  };
  const tally = (
    rows: DecryptedValidationRow[],
    isTruePositive: boolean,
    include: (row: DecryptedValidationRow) => boolean,
  ): void => {
    for (const row of rows) {
      if (
        !include(row) ||
        !rowMatchesSender(row, senderPatterns, normaliseSender)
      ) {
        continue;
      }
      const subtype = rowSubtype(row);
      if (!subtype) continue;
      const entry = entryFor(subtype);
      if (isTruePositive) entry.truePositives += 1;
      else entry.falsePositives += 1;
    }
  };

  tally(categoryRows, true, (row) => row.categoryId === targetCategoryId);
  tally(broadRows, false, (row) => row.categoryId !== targetCategoryId);

  return [...entries.values()].sort(
    (left, right) =>
      right.truePositives - left.truePositives ||
      left.subtype.localeCompare(right.subtype),
  );
}

/**
 * The sub-streams a structural rule may pin: every breakdown entry with at
 * least one true positive and zero false positives, plus the seed email's own
 * sub-stream when nothing contradicts it (it may be absent from the windows
 * because its thread is being categorised right now). Capped to the spec
 * limit, strongest first. Empty when no sub-stream is clean — the caller then
 * falls back to phrase-based drafting.
 */
export function selectCleanSubtypes(
  breakdown: NotificationSubtypeBreakdownEntry[],
  seedSubtype: string,
): string[] {
  const clean = breakdown
    .filter(
      (entry) =>
        entry.truePositives >= MIN_TRUE_POSITIVES_PER_SUBTYPE &&
        entry.falsePositives <= MAX_FALSE_POSITIVES_PER_SUBTYPE,
    )
    .map((entry) => entry.subtype);
  const seedEntry = breakdown.find((entry) => entry.subtype === seedSubtype);
  const seedIsClean =
    !seedEntry || seedEntry.falsePositives <= MAX_FALSE_POSITIVES_PER_SUBTYPE;
  if (seedIsClean && !clean.includes(seedSubtype)) {
    clean.unshift(seedSubtype);
  }
  return clean.slice(0, CATEGORY_RULE_COMPOSITE.MAX_NOTIFICATION_SUBTYPES);
}
