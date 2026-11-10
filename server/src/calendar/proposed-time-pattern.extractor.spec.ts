import {
  extractProposedTimeFromThread,
  findProposedClockTime,
} from "./proposed-time-pattern.extractor";

const MELBOURNE = "Australia/Melbourne";
const PERTH = "Australia/Perth";

/** Tue 10 Nov 2026, 08:00 in Perth (11:00 in Melbourne). */
const TUESDAY_MORNING_PERTH = new Date("2026-11-10T00:00:00Z");

function extract(
  latestText: string,
  options: { priorTexts?: string[]; now?: Date; userTimezone?: string } = {},
) {
  return extractProposedTimeFromThread({
    latestText,
    priorTexts: options.priorTexts ?? [],
    userTimezone: options.userTimezone ?? MELBOURNE,
    now: options.now ?? TUESDAY_MORNING_PERTH,
  });
}

describe("findProposedClockTime", () => {
  it.each([
    ["Would 11.30am suit?", 11, 30],
    ["How about 2 pm?", 14, 0],
    ["Shall we say 9 p.m.?", 21, 0],
    ["12pm works", 12, 0],
    ["12:15am is late", 0, 15],
  ])("reads %p as %i:%i", (text, hour, minute) => {
    expect(findProposedClockTime(text)).toMatchObject({ hour, minute });
  });

  it("ignores numbers without am/pm", () => {
    expect(
      findProposedClockTime("We have 11 students and room 3.30"),
    ).toBeNull();
  });

  it("skips a time the sender says they can't do", () => {
    expect(
      findProposedClockTime("I can't do 9am. Would 2pm work instead?"),
    ).toMatchObject({ hour: 14, minute: 0 });
  });

  it.each(["anytime between 1 and 3pm", "1-3pm on Thursday", "3pm to 5pm"])(
    "leaves a window (%p) to the LLM detector",
    (text) => {
      expect(findProposedClockTime(text)).toBeNull();
    },
  );

  it.each([
    ["Would 11.30am (Fremantle time) suit?", PERTH, "11.30am (Fremantle time)"],
    ["11:30am Perth time works", PERTH, "11:30am Perth time"],
    ["Let's do 10am in Sydney", "Australia/Sydney", "10am in Sydney"],
    ["How about 2pm AEST?", "UTC+10", "2pm AEST"],
    ["11am AWST?", "UTC+8", "11am AWST"],
    ["3pm Eastern?", "America/New_York", "3pm Eastern"],
  ])("reads the zone named after %p", (text, timezone, quoted) => {
    expect(findProposedClockTime(text)).toMatchObject({
      timezone,
      text: quoted,
    });
  });

  it("returns a null zone when none is named", () => {
    expect(
      findProposedClockTime("Would 11.30am suit? It was great"),
    ).toMatchObject({
      timezone: null,
      text: "11.30am",
    });
  });
});

describe("extractProposedTimeFromThread", () => {
  it("resolves 'Would 11.30am (Fremantle time) suit?' to 11:30 Perth today when still ahead", () => {
    const result = extract(
      "Hi Jeremy,\n\nThank you for getting back to us.\n\nWould 11.30am (Fremantle time) suit?",
    );

    expect(result).toEqual({
      proposedTime: "2026-11-10T03:30:00.000Z",
      proposedTimezone: PERTH,
      proposedTimeText: "11.30am (Fremantle time)",
    });
  });

  it("rolls a bare time to the next weekday when today's slot is under an hour away", () => {
    // 11:25 in Perth — 11:30 today is five minutes away, so the sender means tomorrow.
    const result = extract("Would 11.30am (Fremantle time) suit?", {
      now: new Date("2026-11-10T03:25:00Z"),
    });

    expect(result?.proposedTime).toBe("2026-11-11T03:30:00.000Z");
  });

  it("skips the weekend when defaulting to the next occurrence", () => {
    // Friday 13 Nov, 14:00 in Perth.
    const result = extract("Would 11.30am (Fremantle time) suit?", {
      now: new Date("2026-11-13T06:00:00Z"),
    });

    expect(result?.proposedTime).toBe("2026-11-16T03:30:00.000Z");
  });

  it("uses an explicit date in the same message with an AEST time", () => {
    const result = extract("Could we do Thursday 12 November at 2pm AEST?");

    // 14:00 at UTC+10 — AEST is a fixed offset even while Sydney is on daylight time.
    expect(result).toMatchObject({
      proposedTime: "2026-11-12T04:00:00.000Z",
      proposedTimezone: "UTC+10",
    });
  });

  it("uses a relative day ('tomorrow') in the recipient's zone when no zone is named", () => {
    const result = extract("Does tomorrow at 3pm work?");

    // 3pm Melbourne on Wed 11 Nov (AEDT, UTC+11).
    expect(result).toMatchObject({
      proposedTime: "2026-11-11T04:00:00.000Z",
      proposedTimezone: MELBOURNE,
    });
  });

  it("takes the day from an earlier message in the thread", () => {
    const result = extract("Would 11.30am (Fremantle time) suit?", {
      priorTexts: [
        "Thanks for reaching out about the program.",
        "I'm free on Wednesday 18 November if that helps.",
      ],
    });

    expect(result?.proposedTime).toBe("2026-11-18T03:30:00.000Z");
  });

  it("ignores past dates mentioned earlier in the thread", () => {
    const result = extract("Would 11.30am (Fremantle time) suit?", {
      priorTexts: ["We met on Monday 2 November."],
    });

    expect(result?.proposedTime).toBe("2026-11-10T03:30:00.000Z");
  });

  it("reads numeric dates month-first for American zones", () => {
    const result = extract("Can we talk at 3pm Eastern on 11/12?", {
      userTimezone: "America/New_York",
    });

    // 3pm New York on 12 Nov (EST, UTC-5).
    expect(result?.proposedTime).toBe("2026-11-12T20:00:00.000Z");
  });

  it("reads numeric dates day-first elsewhere", () => {
    const result = extract("Can we talk at 3pm on 12/11?");

    expect(result?.proposedTime).toBe("2026-11-12T04:00:00.000Z");
  });

  it("returns null when the message offers no clock time", () => {
    expect(extract("Happy to meet sometime next week.")).toBeNull();
  });
});
