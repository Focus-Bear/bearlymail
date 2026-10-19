import { resolveSnoozeUntil } from "./resolve-snooze-until";

// The server tests run with TZ=UTC, like the deployed API.
describe("resolveSnoozeUntil", () => {
  // 10:17am Friday 16 Oct in Melbourne (AEDT, UTC+11) — still Thursday in UTC.
  const melbourneMorning = new Date("2026-10-15T23:17:00.000Z");
  // "tomorrow" in Melbourne: Saturday 17 Oct, 8am AEDT.
  const melbourneTomorrow8am = "2026-10-16T21:00:00.000Z";

  it("uses the instant the client resolved in the user's timezone", () => {
    const snoozeUntil = resolveSnoozeUntil(
      "tomorrow",
      "en",
      melbourneTomorrow8am,
      melbourneMorning,
    );

    expect(snoozeUntil.toISOString()).toBe(melbourneTomorrow8am);
  });

  it("documents the trap: parsing on the UTC server wakes the snooze the same evening", () => {
    const snoozeUntil = resolveSnoozeUntil(
      "tomorrow",
      "en",
      undefined,
      melbourneMorning,
    );

    // 8am UTC on the 16th is 7pm on the 16th in Melbourne — about nine hours
    // after the user snoozed "until tomorrow".
    expect(snoozeUntil.toISOString()).toBe("2026-10-16T08:00:00.000Z");
  });

  it("falls back to parsing the duration when the client sent no instant", () => {
    const snoozeUntil = resolveSnoozeUntil(
      "4h",
      "en",
      undefined,
      melbourneMorning,
    );

    expect(snoozeUntil.toISOString()).toBe("2026-10-16T03:17:00.000Z");
  });

  it("ignores an unparseable instant", () => {
    const snoozeUntil = resolveSnoozeUntil(
      "4h",
      "en",
      "not-a-date",
      melbourneMorning,
    );

    expect(snoozeUntil.toISOString()).toBe("2026-10-16T03:17:00.000Z");
  });

  it("ignores an instant that is already in the past", () => {
    const snoozeUntil = resolveSnoozeUntil(
      "4h",
      "en",
      "2026-10-15T23:00:00.000Z",
      melbourneMorning,
    );

    expect(snoozeUntil.toISOString()).toBe("2026-10-16T03:17:00.000Z");
  });
});
