/**
 * Tests for timezone.utils — mapToIANATimezone and normalizeTimezone.
 * Added as part of issue #1259 — ICS timezone mapping fix.
 */

import { mapToIANATimezone, normalizeTimezone } from "./timezone.utils";

describe("normalizeTimezone", () => {
  it("returns a valid IANA timezone unchanged", () => {
    expect(normalizeTimezone("America/New_York")).toBe("America/New_York");
    expect(normalizeTimezone("Australia/Sydney")).toBe("Australia/Sydney");
    expect(normalizeTimezone("UTC")).toBe("UTC");
  });

  it("returns UTC for an invalid timezone string", () => {
    expect(normalizeTimezone("Not A Real Zone")).toBe("UTC");
    expect(normalizeTimezone("AUS Eastern Standard Time")).toBe("UTC");
    expect(normalizeTimezone("")).toBe("UTC");
  });
});

describe("mapToIANATimezone", () => {
  describe("passthrough — already valid IANA", () => {
    it("returns America/New_York unchanged", () => {
      expect(mapToIANATimezone("America/New_York")).toBe("America/New_York");
    });

    it("returns Australia/Sydney unchanged", () => {
      expect(mapToIANATimezone("Australia/Sydney")).toBe("Australia/Sydney");
    });

    it("returns UTC unchanged", () => {
      expect(mapToIANATimezone("UTC")).toBe("UTC");
    });

    it("returns Europe/London unchanged", () => {
      expect(mapToIANATimezone("Europe/London")).toBe("Europe/London");
    });

    it("returns Asia/Tokyo unchanged", () => {
      expect(mapToIANATimezone("Asia/Tokyo")).toBe("Asia/Tokyo");
    });
  });

  describe("Windows timezone name mapping", () => {
    it("maps AUS Eastern Standard Time → Australia/Sydney", () => {
      expect(mapToIANATimezone("AUS Eastern Standard Time")).toBe(
        "Australia/Sydney",
      );
    });

    it("maps Eastern Standard Time → America/New_York", () => {
      expect(mapToIANATimezone("Eastern Standard Time")).toBe(
        "America/New_York",
      );
    });

    it("maps Pacific Standard Time → America/Los_Angeles", () => {
      expect(mapToIANATimezone("Pacific Standard Time")).toBe(
        "America/Los_Angeles",
      );
    });

    it("maps Central Standard Time → America/Chicago", () => {
      expect(mapToIANATimezone("Central Standard Time")).toBe(
        "America/Chicago",
      );
    });

    it("maps Mountain Standard Time → America/Denver", () => {
      expect(mapToIANATimezone("Mountain Standard Time")).toBe(
        "America/Denver",
      );
    });

    it("maps GMT Standard Time → Europe/London", () => {
      expect(mapToIANATimezone("GMT Standard Time")).toBe("Europe/London");
    });

    it("maps W. Europe Standard Time → Europe/Berlin", () => {
      expect(mapToIANATimezone("W. Europe Standard Time")).toBe(
        "Europe/Berlin",
      );
    });

    it("maps Tokyo Standard Time → Asia/Tokyo", () => {
      expect(mapToIANATimezone("Tokyo Standard Time")).toBe("Asia/Tokyo");
    });

    it("maps China Standard Time → Asia/Shanghai", () => {
      expect(mapToIANATimezone("China Standard Time")).toBe("Asia/Shanghai");
    });

    it("maps India Standard Time → Asia/Calcutta", () => {
      expect(mapToIANATimezone("India Standard Time")).toBe("Asia/Calcutta");
    });

    it("maps Romance Standard Time → Europe/Paris", () => {
      expect(mapToIANATimezone("Romance Standard Time")).toBe("Europe/Paris");
    });

    it("maps Central European Standard Time → Europe/Warsaw", () => {
      expect(mapToIANATimezone("Central European Standard Time")).toBe(
        "Europe/Warsaw",
      );
    });

    it("maps E. South America Standard Time → America/Sao_Paulo", () => {
      expect(mapToIANATimezone("E. South America Standard Time")).toBe(
        "America/Sao_Paulo",
      );
    });

    it("maps Korea Standard Time → Asia/Seoul", () => {
      expect(mapToIANATimezone("Korea Standard Time")).toBe("Asia/Seoul");
    });
  });

  describe("parenthesised UTC offset format", () => {
    it("maps (UTC+10:00) Canberra, Melbourne, Sydney → Etc/GMT-10", () => {
      const result = mapToIANATimezone(
        "(UTC+10:00) Canberra, Melbourne, Sydney",
      );
      // Should be a valid IANA timezone
      expect(
        () => new Intl.DateTimeFormat("en-US", { timeZone: result }),
      ).not.toThrow();
    });

    it("maps (UTC-05:00) Eastern Time → Etc/GMT+5", () => {
      const result = mapToIANATimezone(
        "(UTC-05:00) Eastern Time (US & Canada)",
      );
      expect(result).toBe("Etc/GMT+5");
    });

    it("maps (UTC+00:00) GMT → UTC", () => {
      const result = mapToIANATimezone("(UTC+00:00) Greenwich Mean Time");
      expect(result).toBe("UTC");
    });

    it("maps (UTC+05:30) Chennai... → Asia/Kolkata", () => {
      const result = mapToIANATimezone(
        "(UTC+05:30) Chennai, Kolkata, Mumbai, New Delhi",
      );
      expect(result).toBe("Asia/Kolkata");
    });
  });

  describe("fallback behaviour", () => {
    it("returns UTC for a completely unknown timezone", () => {
      const warnSpy = jest
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);
      expect(mapToIANATimezone("Totally Fake Timezone")).toBe("UTC");
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Unknown ICS timezone"),
      );
      warnSpy.mockRestore();
    });

    it("returns UTC for an empty string", () => {
      expect(mapToIANATimezone("")).toBe("UTC");
    });

    it("returns UTC for whitespace-only string", () => {
      const warnSpy = jest
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);
      // Whitespace-only → trimmed to "" → early return, no warn
      expect(mapToIANATimezone("   ")).toBe("UTC");
      warnSpy.mockRestore();
    });

    it("logs a warning with the unrecognised timezone string", () => {
      const warnSpy = jest
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);
      mapToIANATimezone("SomeRandomZone");
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("SomeRandomZone"),
      );
      warnSpy.mockRestore();
    });
  });
});
