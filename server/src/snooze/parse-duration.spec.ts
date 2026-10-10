import * as chrono from "chrono-node";

import { SNOOZE_CONSTANTS } from "../constants/snooze-constants";
import { MILLISECONDS } from "../constants/time-constants";
import { durationToHours, parseDurationToDate } from "./parse-duration";

jest.mock("chrono-node", () => {
  const enParse = jest.fn();
  const esParse = jest.fn();
  return {
    en: { casual: { parse: enParse } },
    es: { casual: { parse: esParse } },
  };
});

const mockedParse = chrono.en.casual.parse as jest.Mock;
const mockedEsParse = chrono.es.casual.parse as jest.Mock;

/**
 * A chrono result for a phrase that named an explicit time ("5pm"), so the
 * parser leaves the hour exactly as chrono returned it.
 */
const certainTimeResult = (date: Date) => [
  { start: { date: () => new Date(date), isCertain: () => true } },
];

/**
 * A chrono result for a date-only phrase ("tomorrow"): chrono copies the
 * reference clock across and marks the hour uncertain.
 */
const dateOnlyResult = (date: Date) => [
  { start: { date: () => new Date(date), isCertain: () => false } },
];

describe("parse-duration", () => {
  // Fixed reference time so relative durations and day-names are deterministic.
  const now = new Date("2026-05-26T10:00:00.000Z");

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: chrono can't parse the input, so relative/day-name handling runs.
    mockedParse.mockReturnValue([]);
    mockedEsParse.mockReturnValue([]);
  });

  describe("parseDurationToDate", () => {
    it("parses minute/hour durations from now and calendar durations at 8am", () => {
      expect(parseDurationToDate("90m", now).getTime()).toBe(
        now.getTime() + 90 * MILLISECONDS.MINUTE,
      );
      expect(parseDurationToDate("4h", now).getTime()).toBe(
        now.getTime() + 4 * MILLISECONDS.HOUR,
      );
      const threeDays = new Date(now);
      threeDays.setDate(threeDays.getDate() + 3);
      threeDays.setHours(SNOOZE_CONSTANTS.DEFAULT_SNOOZE_HOUR, 0, 0, 0);
      expect(parseDurationToDate("3d", now)).toEqual(threeDays);

      const twoWeeks = new Date(now);
      twoWeeks.setDate(twoWeeks.getDate() + 2 * SNOOZE_CONSTANTS.DAYS_IN_WEEK);
      twoWeeks.setHours(SNOOZE_CONSTANTS.DEFAULT_SNOOZE_HOUR, 0, 0, 0);
      expect(parseDurationToDate("2w", now)).toEqual(twoWeeks);
    });

    it("parses day-of-month ordinals to the next occurrence at 8am", () => {
      // now is 26 May → "15th" is next month; "27th" is tomorrow; "26th" (today) rolls a month.
      const june15 = new Date(now);
      june15.setMonth(5, 15);
      june15.setHours(SNOOZE_CONSTANTS.DEFAULT_SNOOZE_HOUR, 0, 0, 0);
      expect(parseDurationToDate("15th", now)).toEqual(june15);
      expect(parseDurationToDate("the 15th", now)).toEqual(june15);
      expect(parseDurationToDate("on the 15th", now)).toEqual(june15);
      expect(parseDurationToDate("the 15", now)).toEqual(june15);

      const may27 = new Date(now);
      may27.setDate(27);
      may27.setHours(SNOOZE_CONSTANTS.DEFAULT_SNOOZE_HOUR, 0, 0, 0);
      expect(parseDurationToDate("27th", now)).toEqual(may27);

      const june26 = new Date(now);
      june26.setMonth(5, 26);
      june26.setHours(SNOOZE_CONSTANTS.DEFAULT_SNOOZE_HOUR, 0, 0, 0);
      expect(parseDurationToDate("26th", now)).toEqual(june26);
      expect(mockedParse).not.toHaveBeenCalled();
    });

    it("skips months without the requested day", () => {
      // Late June: June has 30 days, so "31st" lands on 31 July.
      const lateJune = new Date("2026-06-26T10:00:00.000Z");
      const july31 = new Date(lateJune);
      july31.setMonth(6, 31);
      july31.setHours(SNOOZE_CONSTANTS.DEFAULT_SNOOZE_HOUR, 0, 0, 0);
      expect(parseDurationToDate("31st", lateJune)).toEqual(july31);
    });

    it("leaves bare numbers and impossible days to chrono / the fallback", () => {
      expect(parseDurationToDate("15", now).getTime()).toBe(
        now.getTime() + MILLISECONDS.HOUR,
      );
      expect(parseDurationToDate("32nd", now).getTime()).toBe(
        now.getTime() + MILLISECONDS.HOUR,
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
      expected.setHours(SNOOZE_CONSTANTS.DEFAULT_SNOOZE_HOUR, 0, 0, 0);
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
      mockedParse.mockReturnValue(certainTimeResult(chronoResult));

      expect(parseDurationToDate("in 5 hours", now).getTime()).toBe(
        chronoResult.getTime(),
      );
      expect(mockedParse).toHaveBeenCalledWith("in 5 hours", now);
    });

    it("expands 'tom' shorthand to tomorrow before handing to chrono", () => {
      // chrono doesn't recognise "tom"; without the alias it would hit the
      // 1-hour fallback and resurface almost immediately.
      const chronoResult = new Date(now.getTime() + MILLISECONDS.DAY);
      mockedParse.mockReturnValue(certainTimeResult(chronoResult));

      expect(parseDurationToDate("tom", now).getTime()).toBe(
        chronoResult.getTime(),
      );
      expect(mockedParse).toHaveBeenCalledWith("tomorrow", now);
    });

    it("snaps a date-only phrase to the default hour instead of the current time", () => {
      // chrono copies the reference clock into "tomorrow", so without the snap
      // a 16:29 snooze reappears tomorrow at 16:29 rather than the morning.
      // Local-time constructors: the snap compares local hours/minutes.
      const lateAfternoon = new Date(2026, 4, 26, 16, 29, 0, 0);
      mockedParse.mockReturnValue(
        dateOnlyResult(new Date(2026, 4, 27, 16, 29, 0, 0)),
      );

      const result = parseDurationToDate("tomorrow", lateAfternoon);

      expect(result.getHours()).toBe(SNOOZE_CONSTANTS.DEFAULT_SNOOZE_HOUR);
      expect(result.getMinutes()).toBe(0);
      expect(result.getDate()).toBe(27);
    });

    it("leaves an explicit time alone", () => {
      const fivePm = new Date(2026, 4, 26, 17, 0, 0, 0);
      mockedParse.mockReturnValue(certainTimeResult(fivePm));

      expect(parseDurationToDate("5pm", now).getTime()).toBe(fivePm.getTime());
    });

    it("leaves a phrase chrono gave its own implied hour alone", () => {
      // "tonight" resolves to 22:00, which is neither certain nor the caller's
      // clock — snapping it to 8am would move the snooze into the past.
      const tonight = new Date(2026, 4, 26, 22, 0, 0, 0);
      mockedParse.mockReturnValue(dateOnlyResult(tonight));

      expect(parseDurationToDate("tonight", now).getTime()).toBe(
        tonight.getTime(),
      );
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
      mockedEsParse.mockReturnValue(certainTimeResult(chronoResult));

      expect(parseDurationToDate("próximo lunes", now, "es").getTime()).toBe(
        chronoResult.getTime(),
      );
      expect(mockedEsParse).toHaveBeenCalledWith("próximo lunes", now);
      expect(mockedParse).not.toHaveBeenCalled();
    });
  });

  describe("durationToHours", () => {
    it("converts relative durations to whole hours, rounding up", () => {
      expect(durationToHours("4h", now)).toBe(4);
      expect(durationToHours("3d", now)).toBe(70);
      expect(durationToHours("2w", now)).toBe(334);
      // 90 minutes rounds up to 2 hours.
      expect(durationToHours("90m", now)).toBe(2);
    });

    it("never returns less than one hour (past or sub-hour targets)", () => {
      mockedParse.mockReturnValue(
        certainTimeResult(new Date(now.getTime() - MILLISECONDS.DAY)),
      );
      expect(durationToHours("yesterday", now)).toBe(1);
    });

    it("converts a chrono-parsed absolute time to hours from now", () => {
      mockedParse.mockReturnValue(
        certainTimeResult(new Date(now.getTime() + 6 * MILLISECONDS.HOUR)),
      );
      expect(durationToHours("5pm", now)).toBe(6);
    });
  });
});
