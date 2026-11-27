import { findWeekdayDateMismatch } from "./weekday-date-mismatch.helper";

const NOV_20_2026 = "2026-11-20T15:21:00";

describe("findWeekdayDateMismatch", () => {
  it("flags a weekday that does not match the date and suggests both fixes", () => {
    const text =
      "<p>Would the morning of Tuesday 7th December suit for a call?</p>";

    expect(findWeekdayDateMismatch(text, NOV_20_2026)).toBe(
      '"Tuesday 7th December" — 7 December 2026 is a Monday. Did you mean Monday 7 December or Tuesday 8 December?',
    );
  });

  it("accepts a weekday that matches the date", () => {
    expect(
      findWeekdayDateMismatch("How about Tuesday 8th December?", NOV_20_2026),
    ).toBeNull();
  });

  it.each([
    "Tue, the 8th of Dec",
    "Tuesday, December 8th",
    "Tues Dec 8, 2026",
    "tuesday 8 december 2026",
  ])("understands the %s format", (phrase) => {
    expect(findWeekdayDateMismatch(phrase, NOV_20_2026)).toBeNull();
    expect(
      findWeekdayDateMismatch(phrase.replace("8", "9"), NOV_20_2026),
    ).toContain("is a Wednesday");
  });

  it("uses an explicit year instead of guessing", () => {
    // 7 December 2027 is a Tuesday.
    expect(
      findWeekdayDateMismatch("Tuesday 7th December 2027", NOV_20_2026),
    ).toBeNull();
  });

  it("resolves a yearless date to the nearest occurrence", () => {
    // Written in January 2027, "Monday 28th December" means December 2026.
    expect(
      findWeekdayDateMismatch("We spoke on Monday 28th December", "2027-01-05"),
    ).toBeNull();
    // Written in late 2026, "Friday 1st January" means January 2027.
    expect(
      findWeekdayDateMismatch("Back on Friday 1st January", NOV_20_2026),
    ).toBeNull();
  });

  it("flags a day that does not exist in the month", () => {
    expect(findWeekdayDateMismatch("Monday 31st November", NOV_20_2026)).toBe(
      '"Monday 31st November" — November 2026 only has 30 days.',
    );
  });

  it("reports each distinct mismatch once", () => {
    const result = findWeekdayDateMismatch(
      "Tuesday 7th December or Friday 10th December? Again: Tuesday 7th December.",
      NOV_20_2026,
    );

    expect(result?.match(/Tuesday 7th December"/g)).toHaveLength(1);
    expect(result).toContain(
      '"Friday 10th December" — 10 December 2026 is a Thursday.',
    );
  });

  it("ignores text without a weekday and date together", () => {
    expect(
      findWeekdayDateMismatch(
        "See you Tuesday. The invoice is due 7 December. Mon 10:30 works.",
        NOV_20_2026,
      ),
    ).toBeNull();
    expect(findWeekdayDateMismatch("", NOV_20_2026)).toBeNull();
    expect(findWeekdayDateMismatch(undefined, NOV_20_2026)).toBeNull();
  });

  it("does not read a time as a year", () => {
    expect(findWeekdayDateMismatch("Tue 8 Dec 1030", NOV_20_2026)).toBeNull();
  });

  it("reads dates split by HTML tags and entities", () => {
    expect(
      findWeekdayDateMismatch(
        "<p>Tuesday&nbsp;<strong>7th</strong> December</p>",
        NOV_20_2026,
      ),
    ).toContain("is a Monday");
  });

  it("reads lowercase 'may' as the word, not the month", () => {
    // Read as a date, 5 May (2027) is a Wednesday and this would be flagged.
    expect(
      findWeekdayDateMismatch("Friday 5 may work for you?", NOV_20_2026),
    ).toBeNull();
    expect(findWeekdayDateMismatch("Friday 5 May", NOV_20_2026)).toContain(
      "is a Wednesday",
    );
    expect(findWeekdayDateMismatch("Friday, may 5", NOV_20_2026)).toBeNull();
  });

  it("flags a Spanish weekday that does not match the date", () => {
    expect(
      findWeekdayDateMismatch(
        "<p>¿Te va bien el martes 7 de diciembre?</p>",
        NOV_20_2026,
      ),
    ).toBe(
      '"martes 7 de diciembre" — 7 December 2026 is a Monday. Did you mean Monday 7 December or Tuesday 8 December?',
    );
  });

  it.each([
    "martes 8 de diciembre",
    "Martes, 8 de diciembre de 2026",
    "mar 8 dic",
    "miércoles 9 de diciembre",
    "miercoles 9 de diciembre",
    "Mié. 9 dic.",
    "jueves 10 de diciembre del 2026",
    "SÁBADO 12 DE DICIEMBRE",
  ])("understands the Spanish %s format", (phrase) => {
    expect(findWeekdayDateMismatch(phrase, NOV_20_2026)).toBeNull();
  });

  it("flags a Spanish day that does not exist in the month", () => {
    expect(
      findWeekdayDateMismatch("el lunes 31 de noviembre", NOV_20_2026),
    ).toBe('"lunes 31 de noviembre" — November 2026 only has 30 days.');
  });

  it("does not read Spanish words inside other words", () => {
    expect(
      findWeekdayDateMismatch("Pasamar 7 de diciembre", NOV_20_2026),
    ).toBeNull();
  });

  it("stays fast on pathological input", () => {
    const start = Date.now();
    findWeekdayDateMismatch("<".repeat(50_000) + " Tuesday ".repeat(5_000));
    expect(Date.now() - start).toBeLessThan(500);
  });
});
