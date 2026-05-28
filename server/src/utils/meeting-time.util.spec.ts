import { convertLocalTimeInZoneToUtc } from "./meeting-time.util";

describe("convertLocalTimeInZoneToUtc", () => {
  it("converts a Melbourne (AEST, UTC+10) wall-clock time to UTC in June", () => {
    // June is winter in Australia → AEST (UTC+10), no DST.
    const utc = convertLocalTimeInZoneToUtc(
      "2026-06-09T11:00:00",
      "Australia/Melbourne",
    );
    expect(utc).toBe("2026-06-09T01:00:00.000Z");
  });

  it("converts a Melbourne (AEDT, UTC+11) wall-clock time to UTC in November", () => {
    // November is summer in Australia → AEDT (UTC+11).
    const utc = convertLocalTimeInZoneToUtc(
      "2026-11-09T11:00:00",
      "Australia/Melbourne",
    );
    expect(utc).toBe("2026-11-09T00:00:00.000Z");
  });

  it("converts a US Eastern (EDT, UTC-4) wall-clock time to UTC in June", () => {
    const utc = convertLocalTimeInZoneToUtc(
      "2026-06-09T09:00:00",
      "America/New_York",
    );
    expect(utc).toBe("2026-06-09T13:00:00.000Z");
  });

  it("accepts a fixed-offset zone specifier ('UTC+10')", () => {
    const utc = convertLocalTimeInZoneToUtc("2026-06-09T11:00:00", "UTC+10");
    expect(utc).toBe("2026-06-09T01:00:00.000Z");
  });

  it("accepts a half-hour fixed-offset zone specifier ('UTC+5:30')", () => {
    const utc = convertLocalTimeInZoneToUtc("2026-06-09T11:30:00", "UTC+5:30");
    expect(utc).toBe("2026-06-09T06:00:00.000Z");
  });

  it("treats UTC as a no-op offset", () => {
    const utc = convertLocalTimeInZoneToUtc("2026-06-09T11:00:00", "UTC");
    expect(utc).toBe("2026-06-09T11:00:00.000Z");
  });

  it("strips a trailing 'Z' on input so the explicit zone still applies", () => {
    // Defensive: if the LLM accidentally appends Z to a value it intended as
    // local-in-zone, we still convert correctly.
    const utc = convertLocalTimeInZoneToUtc(
      "2026-06-09T11:00:00Z",
      "Australia/Melbourne",
    );
    expect(utc).toBe("2026-06-09T01:00:00.000Z");
  });

  it("strips a trailing '+HH:MM' offset on input so the explicit zone still applies", () => {
    const utc = convertLocalTimeInZoneToUtc(
      "2026-06-09T11:00:00+10:00",
      "America/New_York",
    );
    // Reinterpreted as 11:00 New_York (EDT, UTC-4) = 15:00 UTC.
    expect(utc).toBe("2026-06-09T15:00:00.000Z");
  });

  it("returns null when localTime is null or empty", () => {
    expect(convertLocalTimeInZoneToUtc(null, "Australia/Melbourne")).toBeNull();
    expect(convertLocalTimeInZoneToUtc("", "Australia/Melbourne")).toBeNull();
    expect(
      convertLocalTimeInZoneToUtc(undefined, "Australia/Melbourne"),
    ).toBeNull();
  });

  it("returns null when timezone is null or empty", () => {
    expect(convertLocalTimeInZoneToUtc("2026-06-09T11:00:00", null)).toBeNull();
    expect(convertLocalTimeInZoneToUtc("2026-06-09T11:00:00", "")).toBeNull();
    expect(
      convertLocalTimeInZoneToUtc("2026-06-09T11:00:00", undefined),
    ).toBeNull();
  });

  it("returns null when timezone is unrecognised", () => {
    expect(
      convertLocalTimeInZoneToUtc("2026-06-09T11:00:00", "Not/A_Zone"),
    ).toBeNull();
  });

  it("returns null when localTime is unparseable", () => {
    expect(
      convertLocalTimeInZoneToUtc("not-a-datetime", "Australia/Melbourne"),
    ).toBeNull();
  });
});
