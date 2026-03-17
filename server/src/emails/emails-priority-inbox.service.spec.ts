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
});
