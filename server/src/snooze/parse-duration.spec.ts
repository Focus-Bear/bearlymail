import * as chrono from "chrono-node";

import { SNOOZE_CONSTANTS } from "../constants/snooze-constants";
import { MILLISECONDS } from "../constants/time-constants";
import { durationToHours, parseDurationToDate } from "./parse-duration";

jest.mock("chrono-node", () => {
  const enParseDate = jest.fn();
  const esParseDate = jest.fn();
  return {
    en: { casual: { parseDate: enParseDate } },
    es: { casual: { parseDate: esParseDate } },
  };
});

const mockedParseDate = chrono.en.casual.parseDate as jest.Mock;
const mockedEsParseDate = chrono.es.casual.parseDate as jest.Mock;

describe("parse-duration", () => {
  // Fixed reference time so relative durations and day-names are deterministic.
  const now = new Date("2026-05-26T10:00:00.000Z");

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: chrono can't parse the input, so relative/day-name handling runs.
    mockedParseDate.mockReturnValue(null);
    mockedEsParseDate.mockReturnValue(null);
  });

  describe("parseDurationToDate", () => {
    it("parses relative durations (m/h/d/w) from now", () => {
      expect(parseDurationToDate("90m", now).getTime()).toBe(
        now.getTime() + 90 * MILLISECONDS.MINUTE,
      );
      expect(parseDurationToDate("4h", now).getTime()).toBe(
        now.getTime() + 4 * MILLISECONDS.HOUR,
      );
      expect(parseDurationToDate("3d", now).getTime()).toBe(
        now.getTime() + 3 * MILLISECONDS.DAY,
      );
      expect(parseDurationToDate("2w", now).getTime()).toBe(
        now.getTime() + 2 * SNOOZE_CONSTANTS.DAYS_IN_WEEK * MILLISECONDS.DAY,
      );
    });

    it("treats bare 'm' as minutes regardless of count", () => {
      expect(parseDurationToDate("3m", now).getTime()).toBe(
        now.getTime() + 3 * MILLISECONDS.MINUTE,
      );
      expect(parseDurationToDate("13m", now).getTime()).toBe(
        now.getTime() + 13 * MILLISECONDS.MINUTE,
      );
    });

    it("always treats 'mo' as months", () => {
      const expected = new Date(now);
      expected.setMonth(expected.getMonth() + 18);
      expect(parseDurationToDate("18mo", now).getTime()).toBe(
        expected.getTime(),
      );
    });

    it("always treats 'min' as minutes", () => {
      expect(parseDurationToDate("3min", now).getTime()).toBe(
        now.getTime() + 3 * MILLISECONDS.MINUTE,
      );
    });

    it("resolves day names to the next occurrence at the default snooze hour", () => {
      const result = parseDurationToDate("mon", now);
      expect(result.getTime()).toBeGreaterThan(now.getTime());
      expect(result.getHours()).toBe(SNOOZE_CONSTANTS.DEFAULT_SNOOZE_HOUR);
    });

    it("defers to chrono for natural-language input", () => {
      const chronoResult = new Date(now.getTime() + 5 * MILLISECONDS.HOUR);
      mockedParseDate.mockReturnValue(chronoResult);

      expect(parseDurationToDate("in 5 hours", now)).toBe(chronoResult);
      expect(mockedParseDate).toHaveBeenCalledWith("in 5 hours", now);
    });

    it("expands 'tom' shorthand to tomorrow before handing to chrono", () => {
      // chrono doesn't recognise "tom"; without the alias it would hit the
      // 1-hour fallback and resurface almost immediately.
      const chronoResult = new Date(now.getTime() + MILLISECONDS.DAY);
      mockedParseDate.mockReturnValue(chronoResult);

      expect(parseDurationToDate("tom", now)).toBe(chronoResult);
      expect(mockedParseDate).toHaveBeenCalledWith("tomorrow", now);
    });

    it("falls back to one hour out when nothing parses", () => {
      expect(parseDurationToDate("zzzzz", now).getTime()).toBe(
        now.getTime() + MILLISECONDS.HOUR,
      );
    });

    it("resolves Spanish day names when locale is es", () => {
      // "lun" is Monday.
      const result = parseDurationToDate("lun", now, "es");
      expect(result.getTime()).toBeGreaterThan(now.getTime());
      expect(result.getDay()).toBe(1);
      expect(result.getHours()).toBe(SNOOZE_CONSTANTS.DEFAULT_SNOOZE_HOUR);
    });

    it("resolves accented Spanish day names", () => {
      // "mié" is Wednesday.
      const result = parseDurationToDate("mié", now, "es");
      expect(result.getDay()).toBe(3);
    });

    it("does not treat Spanish day names as days under English", () => {
      // "mar" (Tuesday in Spanish) is not an English day name, so it falls
      // through chrono (mocked null) and the relative regex to the 1h fallback.
      expect(parseDurationToDate("mar", now, "en").getTime()).toBe(
        now.getTime() + MILLISECONDS.HOUR,
      );
    });

    it("uses chrono's Spanish parser when locale is es", () => {
      const chronoResult = new Date(now.getTime() + 5 * MILLISECONDS.HOUR);
      mockedEsParseDate.mockReturnValue(chronoResult);

      expect(parseDurationToDate("próximo lunes", now, "es")).toBe(
        chronoResult,
      );
      expect(mockedEsParseDate).toHaveBeenCalledWith("próximo lunes", now);
      expect(mockedParseDate).not.toHaveBeenCalled();
    });
  });

  describe("durationToHours", () => {
    it("converts relative durations to whole hours, rounding up", () => {
      expect(durationToHours("4h", now)).toBe(4);
      expect(durationToHours("3d", now)).toBe(72);
      expect(durationToHours("2w", now)).toBe(336);
      // 90 minutes rounds up to 2 hours.
      expect(durationToHours("90m", now)).toBe(2);
    });

    it("never returns less than one hour (past or sub-hour targets)", () => {
      mockedParseDate.mockReturnValue(
        new Date(now.getTime() - MILLISECONDS.DAY),
      );
      expect(durationToHours("yesterday", now)).toBe(1);
    });

    it("converts a chrono-parsed absolute time to hours from now", () => {
      mockedParseDate.mockReturnValue(
        new Date(now.getTime() + 6 * MILLISECONDS.HOUR),
      );
      expect(durationToHours("5pm", now)).toBe(6);
    });
  });
});
