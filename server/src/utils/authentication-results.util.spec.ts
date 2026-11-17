import {
  formatSenderAuthResults,
  hasSenderAuthFailure,
  parseAuthenticationResults,
} from "./authentication-results.util";

describe("parseAuthenticationResults", () => {
  it("reads SPF, DKIM and DMARC outcomes from a Gmail header", () => {
    const header =
      'mx.google.com; dkim=pass header.i=@example.test header.s=s1; spf=softfail (google.com: domain of bounce@example.test does not designate 192.0.2.1) smtp.mailfrom="bounce@example.test"; dmarc=fail (p=REJECT) header.from=example.test';
    expect(parseAuthenticationResults(header)).toEqual({
      spf: "softfail",
      dkim: "pass",
      dmarc: "fail",
    });
  });

  it("returns null for a missing header or one with no known methods", () => {
    expect(parseAuthenticationResults(undefined)).toBeNull();
    expect(parseAuthenticationResults("mx.example.test; none")).toBeNull();
  });

  it("ignores unknown result values", () => {
    expect(parseAuthenticationResults("mx; spf=bogus; dkim=pass")).toEqual({
      dkim: "pass",
    });
  });
});

describe("hasSenderAuthFailure", () => {
  it.each([
    [{ dmarc: "fail" as const }, true],
    [{ spf: "fail" as const, dkim: "none" as const }, true],
    // A valid DKIM signature vouches for a message whose SPF broke in forwarding.
    [{ spf: "fail" as const, dkim: "pass" as const }, false],
    [{ spf: "softfail" as const }, false],
    [{ spf: "pass" as const, dkim: "pass" as const, dmarc: "pass" as const }, false],
  ])("%j → %s", (results, expected) => {
    expect(hasSenderAuthFailure(results)).toBe(expected);
  });

  it("is false when the outcomes are unknown", () => {
    expect(hasSenderAuthFailure(null)).toBe(false);
  });
});

describe("formatSenderAuthResults", () => {
  it("lists the known outcomes in SPF, DKIM, DMARC order", () => {
    expect(formatSenderAuthResults({ dmarc: "pass", spf: "fail" })).toBe(
      "spf=fail, dmarc=pass",
    );
    expect(formatSenderAuthResults(null)).toBe("");
  });
});
