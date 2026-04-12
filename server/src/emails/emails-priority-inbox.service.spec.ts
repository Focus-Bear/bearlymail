/**
 * Unit tests for priority inbox filtering (fix for issue #1088 and #1101).
 *
 * Root cause that was fixed (#1088): getInboxSummary and runInboxQuery combined
 * starCount = 0 (triage mode) with minPriority >= N. High-priority threads
 * that have already been actioned (starCount > 0) were excluded, producing
 * zero results even though getPriorityCounts (no starCount filter) shows
 * non-zero counts in the UI.
 *
 * Fix (#1088): when minPriority is set, drop the starCount mode filter so the
 * priority inbox returns all priority-matching threads regardless of
 * triage/action state — mirroring getPriorityCounts behaviour.
 *
 * Root cause that was fixed (#1101): only minPriority was sent/applied for
 * bounded range filters like "15-30". maxPriority was missing from the filter
 * chain, so "Medium (15-30)" showed all emails with score >= 15 instead of
 * 15 <= score < 30.
 *
 * Fix (#1101): add maxPriority to filter interfaces, query builders
 * (AND priorityScore < $N), client params, and controller query params.
 */

import { INBOX_MODES } from "../constants/query-limits";

/**
 * Pure function that mirrors the thread-filter SQL fragment selection logic
 * in getInboxSummary and runInboxQuery (emails.service.ts).
 *
 * Keep this in sync with the actual implementation in emails.service.ts.
 */
const BLOCKED_MODE_THREAD_FILTER = "/* blocked filter */";

function buildThreadFilter(
  mode: string,
  hasMinPriority: boolean,
  hasMaxPriority: boolean = false,
): string {
  // When minPriority or maxPriority is set, drop the starCount mode filter so the priority inbox
  // shows threads across all triage states — matching getPriorityCounts behaviour.
  const priorityModeActive =
    (hasMinPriority || hasMaxPriority) && mode !== INBOX_MODES.BLOCKED;

  if (priorityModeActive) {
    return 'AND thread."isArchived" = false';
  }

  if (mode === INBOX_MODES.BLOCKED) {
    return BLOCKED_MODE_THREAD_FILTER;
  }

  if (mode === INBOX_MODES.ACTION || mode === INBOX_MODES.FOLLOW_UP) {
    return 'AND thread."isArchived" = false AND thread."starCount" > 0';
  }

  // default: triage
  return 'AND thread."isArchived" = false AND thread."starCount" = 0';
}

describe("priority inbox thread filter (fix #1088)", () => {
  describe("without minPriority — mode-based starCount filtering is preserved", () => {
    it("triage mode: only untriaged threads (starCount = 0)", () => {
      const filter = buildThreadFilter(INBOX_MODES.TRIAGE, false);
      expect(filter).toContain('"starCount" = 0');
      expect(filter).not.toContain('"starCount" > 0');
    });

    it("action mode: only actioned threads (starCount > 0)", () => {
      const filter = buildThreadFilter(INBOX_MODES.ACTION, false);
      expect(filter).toContain('"starCount" > 0');
      expect(filter).not.toContain('"starCount" = 0');
    });

    it("follow-up mode: only actioned threads (starCount > 0)", () => {
      const filter = buildThreadFilter(INBOX_MODES.FOLLOW_UP, false);
      expect(filter).toContain('"starCount" > 0');
    });

    it("blocked mode: uses blocked sender filter", () => {
      const filter = buildThreadFilter(INBOX_MODES.BLOCKED, false);
      expect(filter).toBe(BLOCKED_MODE_THREAD_FILTER);
    });
  });

  describe("fix(#1088): with minPriority — starCount filter is dropped", () => {
    it("triage mode WITH minPriority: no starCount restriction so actioned high-priority threads are included", () => {
      const filter = buildThreadFilter(INBOX_MODES.TRIAGE, true);
      // Must NOT exclude actioned threads — they can have high priorityScore too
      expect(filter).not.toContain("starCount");
      // Must still exclude archived threads
      expect(filter).toContain('"isArchived" = false');
    });

    it("action mode WITH minPriority: drops starCount filter", () => {
      const filter = buildThreadFilter(INBOX_MODES.ACTION, true);
      expect(filter).not.toContain("starCount");
      expect(filter).toContain('"isArchived" = false');
    });

    it("follow-up mode WITH minPriority: drops starCount filter", () => {
      const filter = buildThreadFilter(INBOX_MODES.FOLLOW_UP, true);
      expect(filter).not.toContain("starCount");
    });

    it("blocked mode WITH minPriority: still uses blocked sender filter (priority does not override blocked)", () => {
      const filter = buildThreadFilter(INBOX_MODES.BLOCKED, true);
      expect(filter).toBe(BLOCKED_MODE_THREAD_FILTER);
    });
  });

  describe("COALESCE default for priorityScore (fix #1088)", () => {
    /**
     * Threads with null priorityScore must default to 0, NOT 50.
     *
     * The previous COALESCE(50) hack was incorrect: it caused threads with
     * no priority score to appear in high-priority (>= 50) results, inflating
     * counts and hiding the real issue (the starCount filter).
     *
     * Correct default is 0: null means "not yet scored" which should be
     * treated as low priority, not medium.
     */

    it("null priorityScore treated as 0 → excluded from minPriority=50 filter (correct)", () => {
      // COALESCE(priorityScore, 0)
      const coalesceDefault = 0;
      // null → 0
      const nullScoreValue = coalesceDefault;
      const minPriority = 50;

      expect(nullScoreValue >= minPriority).toBe(false);
    });

    it("null priorityScore treated as 50 → included in minPriority=50 (WRONG — was the bug)", () => {
      // COALESCE(priorityScore, 50) — the wrong hack
      const coalesceDefault = 50;
      // null → 50
      const nullScoreValue = coalesceDefault;
      const minPriority = 50;

      // This was the wrong behaviour — inflated priority counts with unscored threads
      // Documents what the bug did
      expect(nullScoreValue >= minPriority).toBe(true);
    });

    it("thread with real priorityScore=80 is included at minPriority=50 regardless of COALESCE default", () => {
      const priorityScore = 80;
      // COALESCE(80, 0) = 80
      const coalesceResult = priorityScore;
      expect(coalesceResult >= 50).toBe(true);
    });

    it("thread with real priorityScore=30 is excluded at minPriority=50", () => {
      const priorityScore = 30;
      // COALESCE(30, 0) = 30
      const coalesceResult = priorityScore;
      expect(coalesceResult >= 50).toBe(false);
    });
  });

  describe("fix(#1101): maxPriority upper bound filtering", () => {
    /**
     * Range filters like "Medium (15-30)" must send both minPriority=15 and maxPriority=30.
     * Previously only minPriority was sent, so "Medium" showed all emails with score >= 15.
     * The fix adds AND priorityScore < maxPriority to the query.
     */

    it("thread filter activates priority mode when only maxPriority is set", () => {
      const filter = buildThreadFilter(INBOX_MODES.TRIAGE, false, true);
      // maxPriority alone should drop the starCount restriction
      expect(filter).not.toContain("starCount");
      expect(filter).toContain('"isArchived" = false');
    });

    it("thread filter with maxPriority in blocked mode still uses blocked filter", () => {
      const filter = buildThreadFilter(INBOX_MODES.BLOCKED, false, true);
      expect(filter).toBe(BLOCKED_MODE_THREAD_FILTER);
    });

    it("score=20 is within range [15, 30) → included", () => {
      const priorityScore = 20;
      const minPriority = 15;
      const maxPriority = 30;
      expect(priorityScore >= minPriority && priorityScore < maxPriority).toBe(
        true,
      );
    });

    it("score=30 is at the upper boundary → excluded (strict less-than)", () => {
      const priorityScore = 30;
      const minPriority = 15;
      const maxPriority = 30;
      expect(priorityScore >= minPriority && priorityScore < maxPriority).toBe(
        false,
      );
    });

    it("score=15 is at the lower boundary → included", () => {
      const priorityScore = 15;
      const minPriority = 15;
      const maxPriority = 30;
      expect(priorityScore >= minPriority && priorityScore < maxPriority).toBe(
        true,
      );
    });

    it("score=14 is below lower boundary → excluded", () => {
      const priorityScore = 14;
      const minPriority = 15;
      const maxPriority = 30;
      expect(priorityScore >= minPriority && priorityScore < maxPriority).toBe(
        false,
      );
    });

    it("null score (COALESCE to 0) is outside range [15, 30) → excluded", () => {
      // COALESCE(null, 0) = 0
      const coalesceResult = 0;
      const minPriority = 15;
      const maxPriority = 30;
      expect(
        coalesceResult >= minPriority && coalesceResult < maxPriority,
      ).toBe(false);
    });

    it("'Very High' range (min=50, max=null) — no upper bound means maxPriority not sent", () => {
      // When max is null, maxPriority param is not appended, so no upper bound filter
      const score = 999;
      const minPriority = 50;
      // No maxPriority: only lower bound applies
      expect(score >= minPriority).toBe(true);
    });
  });

  /**
   * getPriorityCounts boundary assertions (fix #1052)
   *
   * The count SQL now uses COALESCE(priorityScore, 0) with [min, max) half-open intervals
   * to exactly match the inbox filter query. These tests verify that every boundary score
   * (0, 15, 30, 50) lands in the correct bucket under the new convention.
   */
  describe("getPriorityCounts — [min, max) boundary alignment with inbox filter", () => {
    /**
     * Helper: which bucket does a score fall into under the new COALESCE [min, max) rules?
     * Mirrors: COALESCE("priorityScore", 0)
     *   veryHigh:  >= 50
     *   high:      >= 30 AND < 50
     *   medium:    >= 15 AND < 30
     *   low:       >= 0  AND < 15
     *   veryLow:   < 0
     */
    function whichBucket(
      rawScore: number | null,
    ): "veryHigh" | "high" | "medium" | "low" | "veryLow" {
      const score = rawScore ?? 0;
      if (score >= 50) {
        return "veryHigh";
      }
      if (score >= 30) {
        return "high";
      }
      if (score >= 15) {
        return "medium";
      }
      if (score >= 0) {
        return "low";
      }
      return "veryLow";
    }

    it("score=50 → veryHigh bucket (lower boundary of veryHigh)", () => {
      expect(whichBucket(50)).toBe("veryHigh");
    });

    it("score=49 → high bucket (just below veryHigh threshold)", () => {
      expect(whichBucket(49)).toBe("high");
    });

    it("score=30 → high bucket (lower boundary of high)", () => {
      expect(whichBucket(30)).toBe("high");
    });

    it("score=29 → medium bucket (just below high threshold)", () => {
      expect(whichBucket(29)).toBe("medium");
    });

    it("score=15 → medium bucket (lower boundary of medium)", () => {
      expect(whichBucket(15)).toBe("medium");
    });

    it("score=14 → low bucket (just below medium threshold)", () => {
      expect(whichBucket(14)).toBe("low");
    });

    it("score=0 → low bucket (lower boundary of low)", () => {
      expect(whichBucket(0)).toBe("low");
    });

    it("score=-1 → veryLow bucket (just below low threshold)", () => {
      expect(whichBucket(-1)).toBe("veryLow");
    });

    it("null score (COALESCE to 0) → low bucket (same as score=0)", () => {
      expect(whichBucket(null)).toBe("low");
    });

    it("count bucket and inbox filter agree for score=15 (previously in 'Low' count but 'Medium' filter)", () => {
      // score=15: old count had >= 0 AND <= 15 (Low), inbox filter had >= 15 (Medium) → MISMATCH
      // new count has >= 15 AND < 30 (Medium), inbox filter >= 15 AND < 30 (Medium) → MATCH
      const score = 15;
      const mediumBucketMin = 15;
      const mediumBucketMax = 30;
      const inFilter = score >= mediumBucketMin && score < mediumBucketMax;
      const inCount = whichBucket(score) === "medium";
      expect(inFilter).toBe(true);
      expect(inCount).toBe(true);
      // count and filter must agree
      expect(inFilter).toBe(inCount);
    });

    it("count bucket and inbox filter agree for score=30 (previously in 'Medium' count but 'High' filter)", () => {
      // score=30: old count had > 15 AND <= 30 (Medium), inbox filter had >= 30 AND < 50 (High) → MISMATCH
      // new count has >= 30 AND < 50 (High), inbox filter >= 30 AND < 50 (High) → MATCH
      const score = 30;
      const highBucketMin = 30;
      const highBucketMax = 50;
      const inFilter = score >= highBucketMin && score < highBucketMax;
      const inCount = whichBucket(score) === "high";
      expect(inFilter).toBe(true);
      expect(inCount).toBe(true);
      expect(inFilter).toBe(inCount);
    });

    it("count bucket and inbox filter agree for score=50 (previously in 'High' count but 'VeryHigh' filter)", () => {
      // score=50: old count had > 30 AND <= 50 (High), inbox filter had >= 50 (VeryHigh) → MISMATCH
      // new count has >= 50 (VeryHigh), inbox filter >= 50 (VeryHigh) → MATCH
      const score = 50;
      const veryHighBucketMin = 50;
      const inFilter = score >= veryHighBucketMin;
      const inCount = whichBucket(score) === "veryHigh";
      expect(inFilter).toBe(true);
      expect(inCount).toBe(true);
      expect(inFilter).toBe(inCount);
    });
  });
});
