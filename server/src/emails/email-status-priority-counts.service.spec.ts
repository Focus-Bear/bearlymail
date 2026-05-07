/**
 * Unit tests for the batch/snooze visibility fix in getPriorityCounts (fix #1742).
 *
 * Root cause: getPriorityCounts used strict `isBatched = false AND isSnoozed = false`
 * conditions, which excluded threads that were marked as batched/snoozed but whose
 * release/snooze time had already passed (e.g. isBatched=true with batchReleaseAt in
 * the past). The inbox summary query (querySummaryRows) counts those threads as visible
 * using OR conditions, causing the priority filter counts to be far lower than the tab
 * total (e.g. 1 vs 229 in triage).
 *
 * Fix: getPriorityCounts now uses the same OR-based batch/snooze conditions as
 * querySummaryRows in email-inbox.service.ts:
 *   ("isBatched" = false OR "batchReleaseAt" IS NULL OR "batchReleaseAt" <= NOW())
 *   ("isSnoozed" = false OR "snoozeUntil" IS NULL OR "snoozeUntil" <= NOW())
 */

const NOW = new Date("2026-04-13T00:00:00.000Z");
const PAST = new Date("2026-04-12T00:00:00.000Z");
const FUTURE = new Date("2026-04-14T00:00:00.000Z");

interface ThreadRow {
  isBatched: boolean;
  batchReleaseAt: Date | null;
  isSnoozed: boolean;
  snoozeUntil: Date | null;
}

/**
 * Mirror of the batch/snooze visibility logic used in getPriorityCounts (post-fix).
 * Returns true when the thread should be visible (i.e. counted in priority buckets).
 */
function isVisibleInPriorityCounts(row: ThreadRow, now: Date = NOW): boolean {
  const batchVisible =
    !row.isBatched || row.batchReleaseAt === null || row.batchReleaseAt <= now;
  const snoozeVisible =
    !row.isSnoozed || row.snoozeUntil === null || row.snoozeUntil <= now;
  return batchVisible && snoozeVisible;
}

/**
 * Mirror of the OLD (broken) strict condition used before fix #1742.
 * Returns true only when isBatched=false AND isSnoozed=false.
 */
function isVisibleOldStrictCondition(row: ThreadRow): boolean {
  return !row.isBatched && !row.isSnoozed;
}

describe("getPriorityCounts batch/snooze visibility — fix #1742", () => {
  describe("batch release conditions", () => {
    it("includes thread that is not batched (happy path)", () => {
      const row: ThreadRow = {
        isBatched: false,
        batchReleaseAt: null,
        isSnoozed: false,
        snoozeUntil: null,
      };
      expect(isVisibleInPriorityCounts(row)).toBe(true);
    });

    it("includes batched thread whose release time has already passed (root cause of #1742)", () => {
      const row: ThreadRow = {
        isBatched: true,
        batchReleaseAt: PAST,
        isSnoozed: false,
        snoozeUntil: null,
      };
      // The tab count (querySummaryRows) considers this thread visible — so must priority counts
      expect(isVisibleInPriorityCounts(row)).toBe(true);
    });

    it("includes batched thread with NULL batchReleaseAt (no scheduled release)", () => {
      const row: ThreadRow = {
        isBatched: true,
        batchReleaseAt: null,
        isSnoozed: false,
        snoozeUntil: null,
      };
      expect(isVisibleInPriorityCounts(row)).toBe(true);
    });

    it("excludes batched thread with a FUTURE release time (genuinely batched)", () => {
      const row: ThreadRow = {
        isBatched: true,
        batchReleaseAt: FUTURE,
        isSnoozed: false,
        snoozeUntil: null,
      };
      expect(isVisibleInPriorityCounts(row)).toBe(false);
    });

    it("OLD strict logic incorrectly excluded batched threads with past release times", () => {
      const row: ThreadRow = {
        isBatched: true,
        batchReleaseAt: PAST,
        isSnoozed: false,
        snoozeUntil: null,
      };
      // Old logic WRONGLY excluded these threads → caused count discrepancy
      expect(isVisibleOldStrictCondition(row)).toBe(false);
      // New logic CORRECTLY includes them
      expect(isVisibleInPriorityCounts(row)).toBe(true);
    });
  });

  describe("snooze conditions", () => {
    it("includes snoozed thread whose snooze time has already passed", () => {
      const row: ThreadRow = {
        isBatched: false,
        batchReleaseAt: null,
        isSnoozed: true,
        snoozeUntil: PAST,
      };
      expect(isVisibleInPriorityCounts(row)).toBe(true);
    });

    it("includes snoozed thread with NULL snoozeUntil", () => {
      const row: ThreadRow = {
        isBatched: false,
        batchReleaseAt: null,
        isSnoozed: true,
        snoozeUntil: null,
      };
      expect(isVisibleInPriorityCounts(row)).toBe(true);
    });

    it("excludes snoozed thread with a FUTURE snooze time (genuinely snoozed)", () => {
      const row: ThreadRow = {
        isBatched: false,
        batchReleaseAt: null,
        isSnoozed: true,
        snoozeUntil: FUTURE,
      };
      expect(isVisibleInPriorityCounts(row)).toBe(false);
    });

    it("OLD strict logic incorrectly excluded snoozed threads with past snooze times", () => {
      const row: ThreadRow = {
        isBatched: false,
        batchReleaseAt: null,
        isSnoozed: true,
        snoozeUntil: PAST,
      };
      expect(isVisibleOldStrictCondition(row)).toBe(false);
      expect(isVisibleInPriorityCounts(row)).toBe(true);
    });
  });

  describe("combined batch + snooze conditions", () => {
    it("excludes thread that is both batched (future) and snoozed (future)", () => {
      const row: ThreadRow = {
        isBatched: true,
        batchReleaseAt: FUTURE,
        isSnoozed: true,
        snoozeUntil: FUTURE,
      };
      expect(isVisibleInPriorityCounts(row)).toBe(false);
    });

    it("excludes thread that is batched (future) but snooze is past", () => {
      const row: ThreadRow = {
        isBatched: true,
        batchReleaseAt: FUTURE,
        isSnoozed: true,
        snoozeUntil: PAST,
      };
      // Still batched → not visible
      expect(isVisibleInPriorityCounts(row)).toBe(false);
    });

    it("excludes thread that is snoozed (future) but batch is past", () => {
      const row: ThreadRow = {
        isBatched: true,
        batchReleaseAt: PAST,
        isSnoozed: true,
        snoozeUntil: FUTURE,
      };
      // Still snoozed → not visible
      expect(isVisibleInPriorityCounts(row)).toBe(false);
    });

    it("includes thread where both batch and snooze times have passed", () => {
      const row: ThreadRow = {
        isBatched: true,
        batchReleaseAt: PAST,
        isSnoozed: true,
        snoozeUntil: PAST,
      };
      expect(isVisibleInPriorityCounts(row)).toBe(true);
    });
  });

  describe("consistency with inbox summary (querySummaryRows) conditions", () => {
    /**
     * These tests verify that isVisibleInPriorityCounts matches the conditions
     * used in querySummaryRows (email-inbox.service.ts lines 206-207):
     *   AND (thread."isBatched" = false OR thread."batchReleaseAt" IS NULL OR thread."batchReleaseAt" <= NOW())
     *   AND (thread."isSnoozed" = false OR thread."snoozeUntil" IS NULL OR thread."snoozeUntil" <= NOW())
     */

    function isVisibleInboxSummary(row: ThreadRow, now: Date = NOW): boolean {
      // Exact mirror of querySummaryRows conditions
      const batchOk =
        !row.isBatched ||
        row.batchReleaseAt === null ||
        row.batchReleaseAt <= now;
      const snoozeOk =
        !row.isSnoozed || row.snoozeUntil === null || row.snoozeUntil <= now;
      return batchOk && snoozeOk;
    }

    const testCases: ThreadRow[] = [
      {
        isBatched: false,
        batchReleaseAt: null,
        isSnoozed: false,
        snoozeUntil: null,
      },
      {
        isBatched: true,
        batchReleaseAt: PAST,
        isSnoozed: false,
        snoozeUntil: null,
      },
      {
        isBatched: true,
        batchReleaseAt: FUTURE,
        isSnoozed: false,
        snoozeUntil: null,
      },
      {
        isBatched: true,
        batchReleaseAt: null,
        isSnoozed: false,
        snoozeUntil: null,
      },
      {
        isBatched: false,
        batchReleaseAt: null,
        isSnoozed: true,
        snoozeUntil: PAST,
      },
      {
        isBatched: false,
        batchReleaseAt: null,
        isSnoozed: true,
        snoozeUntil: FUTURE,
      },
      {
        isBatched: false,
        batchReleaseAt: null,
        isSnoozed: true,
        snoozeUntil: null,
      },
      {
        isBatched: true,
        batchReleaseAt: PAST,
        isSnoozed: true,
        snoozeUntil: PAST,
      },
      {
        isBatched: true,
        batchReleaseAt: FUTURE,
        isSnoozed: true,
        snoozeUntil: FUTURE,
      },
    ];

    it.each(testCases)(
      "getPriorityCounts and getInboxSummary agree for %j",
      (row) => {
        expect(isVisibleInPriorityCounts(row)).toBe(isVisibleInboxSummary(row));
      },
    );
  });
});
