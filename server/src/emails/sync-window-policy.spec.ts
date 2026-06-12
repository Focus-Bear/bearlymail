import { QUERY_LIMITS } from "../constants/query-limits";
import { MILLISECONDS } from "../constants/time-constants";
import {
  getOldestAllowedSyncDate,
  INCREMENTAL_SYNC_OVERLAP_HOURS,
  resolveMaxFetchResults,
  resolveSyncWindowStart,
  shouldFlagSyncWindowLimited,
} from "./sync-window-policy";

describe("sync-window-policy", () => {
  const now = new Date("2026-06-11T12:00:00.000Z");
  const oldestAllowed = new Date(
    now.getTime() - QUERY_LIMITS.ONGOING_SYNC_WINDOW_DAYS * MILLISECONDS.DAY,
  );

  describe("getOldestAllowedSyncDate", () => {
    it("returns ONGOING_SYNC_WINDOW_DAYS before now", () => {
      expect(getOldestAllowedSyncDate(now)).toEqual(oldestAllowed);
    });
  });

  describe("resolveSyncWindowStart", () => {
    it("uses the full ongoing window for the initial sync (no lastEmailSyncAt)", () => {
      const start = resolveSyncWindowStart({ lastEmailSyncAt: null, now });
      expect(start).toEqual(oldestAllowed);
    });

    it("uses an incremental window with overlap when lastEmailSyncAt is recent", () => {
      const lastEmailSyncAt = new Date(now.getTime() - MILLISECONDS.HOUR);
      const start = resolveSyncWindowStart({ lastEmailSyncAt, now });
      expect(start).toEqual(
        new Date(
          lastEmailSyncAt.getTime() -
            INCREMENTAL_SYNC_OVERLAP_HOURS * MILLISECONDS.HOUR,
        ),
      );
    });

    it("clamps an old lastEmailSyncAt to the ongoing window", () => {
      const lastEmailSyncAt = new Date(now.getTime() - 30 * MILLISECONDS.DAY);
      const start = resolveSyncWindowStart({ lastEmailSyncAt, now });
      expect(start).toEqual(oldestAllowed);
    });

    it("honours an explicit syncWindowHours inside the ongoing window", () => {
      const start = resolveSyncWindowStart({ syncWindowHours: 48, now });
      expect(start).toEqual(new Date(now.getTime() - 48 * MILLISECONDS.HOUR));
    });

    it("clamps an explicit syncWindowHours wider than the ongoing window", () => {
      const start = resolveSyncWindowStart({ syncWindowHours: 24 * 30, now });
      expect(start).toEqual(oldestAllowed);
    });

    it("clamps the extended (noDateFilter) sync to the ongoing window", () => {
      const start = resolveSyncWindowStart({ noDateFilter: true, now });
      expect(start).toEqual(oldestAllowed);
    });

    it("noDateFilter wins over other inputs", () => {
      const start = resolveSyncWindowStart({
        noDateFilter: true,
        syncWindowHours: 1,
        lastEmailSyncAt: new Date(now.getTime() - MILLISECONDS.HOUR),
        now,
      });
      expect(start).toEqual(oldestAllowed);
    });
  });

  describe("resolveMaxFetchResults", () => {
    it("caps the initial sync at INITIAL_SYNC_MAX_EMAILS", () => {
      expect(resolveMaxFetchResults(true)).toBe(
        QUERY_LIMITS.INITIAL_SYNC_MAX_EMAILS,
      );
    });

    it("uses the standard inbox limit for ongoing syncs", () => {
      expect(resolveMaxFetchResults(false)).toBe(QUERY_LIMITS.INBOX_TOTAL);
    });
  });

  describe("shouldFlagSyncWindowLimited", () => {
    it("flags when the initial sync hit the fetch cap", () => {
      expect(
        shouldFlagSyncWindowLimited({
          isInitialSync: true,
          hitFetchCap: true,
          olderMailExists: false,
        }),
      ).toBe(true);
    });

    it("flags when older mail exists beyond the window", () => {
      expect(
        shouldFlagSyncWindowLimited({
          isInitialSync: true,
          hitFetchCap: false,
          olderMailExists: true,
        }),
      ).toBe(true);
    });

    it("does not flag a small mailbox that fits the cap and window", () => {
      expect(
        shouldFlagSyncWindowLimited({
          isInitialSync: true,
          hitFetchCap: false,
          olderMailExists: false,
        }),
      ).toBe(false);
    });

    it("never flags ongoing syncs", () => {
      expect(
        shouldFlagSyncWindowLimited({
          isInitialSync: false,
          hitFetchCap: true,
          olderMailExists: true,
        }),
      ).toBe(false);
    });
  });
});
