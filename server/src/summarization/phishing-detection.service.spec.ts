/**
 * Unit tests for phishing-detection.service.ts
 *
 * Covers:
 *  - TRUSTED_LINK_DOMAINS allowlist behaviour in hasDomainMismatch()
 *  - detectPhishingSignal() (deprecated heuristic — kept for reference)
 *  - extractPhishingSignals() — LLM context extraction
 */

import {
  detectDisplayNameDomainMismatch,
  detectPhishingSignal,
  extractPhishingSignals,
  mergePhishingSignals,
  validatePhishingConfidence,
} from "./phishing-detection.service";

// ---------------------------------------------------------------------------
// hasDomainMismatch via detectPhishingSignal (the only public path that exposes it)
// We test the trusted-domain logic through extractPhishingSignals.hasDomainMismatch.
// ---------------------------------------------------------------------------

describe("extractPhishingSignals — trusted domain allowlist (TRUSTED_LINK_DOMAINS)", () => {
  it("focusbear.io sender + docs.google.com link → hasDomainMismatch = false", () => {
    const body = "Click here: https://docs.google.com/document/d/abc123";
    const signals = extractPhishingSignals("hello@focusbear.io", body);
    expect(signals.hasDomainMismatch).toBe(false);
  });

  it("focusbear.io sender + github.com link → hasDomainMismatch = false", () => {
    const body =
      "See the PR: https://github.com/Focus-Bear/BearlyMail/pull/1392";
    const signals = extractPhishingSignals("noreply@focusbear.io", body);
    expect(signals.hasDomainMismatch).toBe(false);
  });

  it("focusbear.io sender + mail.google.com (subdomain) → hasDomainMismatch = false", () => {
    const body = "Sign in at https://mail.google.com/";
    const signals = extractPhishingSignals("team@focusbear.io", body);
    expect(signals.hasDomainMismatch).toBe(false);
  });

  it("focusbear.io sender + github.io subdomain → hasDomainMismatch = false", () => {
    const body = "Docs at https://focusbear.github.io/docs";
    const signals = extractPhishingSignals("team@focusbear.io", body);
    expect(signals.hasDomainMismatch).toBe(false);
  });

  it("focusbear.io sender + evil-phishing.com link → hasDomainMismatch = true", () => {
    const body = "Verify your account: https://evil-phishing.com/steal-creds";
    const signals = extractPhishingSignals("team@focusbear.io", body);
    expect(signals.hasDomainMismatch).toBe(true);
  });

  it("focusbear.io sender + mix of trusted + untrusted links → hasDomainMismatch = true (untrusted present)", () => {
    const body = [
      "See PR: https://github.com/org/repo",
      "Also visit: https://evil-phishing.com/login",
    ].join("\n");
    const signals = extractPhishingSignals("team@focusbear.io", body);
    // evil-phishing.com is not trusted and doesn't match sender, so mismatch = true
    expect(signals.hasDomainMismatch).toBe(true);
  });

  it("focusbear.io sender + only trusted links (multiple) → hasDomainMismatch = false", () => {
    const body = [
      "See: https://github.com/org/repo",
      "Docs: https://docs.google.com/d/abc",
      "Meet: https://zoom.us/j/12345",
      "Chat: https://slack.com/archives/C123",
    ].join("\n");
    const signals = extractPhishingSignals("team@focusbear.io", body);
    expect(signals.hasDomainMismatch).toBe(false);
  });

  it("sender domain matches one of the untrusted links → hasDomainMismatch = false", () => {
    const body = [
      "See docs: https://docs.google.com/d/abc",
      "Our app: https://app.focusbear.io/dashboard",
    ].join("\n");
    const signals = extractPhishingSignals("team@focusbear.io", body);
    // app.focusbear.io matches sender domain focusbear.io → no mismatch
    expect(signals.hasDomainMismatch).toBe(false);
  });

  it("no links in body → hasDomainMismatch = false", () => {
    const body = "Just a plain text email with no links.";
    const signals = extractPhishingSignals("team@focusbear.io", body);
    expect(signals.hasDomainMismatch).toBe(false);
  });

  it("extracts linkedDomains correctly (trusted + untrusted)", () => {
    const body = "https://github.com/repo and https://evil.com/page";
    const signals = extractPhishingSignals("team@focusbear.io", body);
    expect(signals.linkedDomains).toContain("github.com");
    expect(signals.linkedDomains).toContain("evil.com");
  });
});

// ---------------------------------------------------------------------------
// detectPhishingSignal — deprecated heuristic, kept for reference
// ---------------------------------------------------------------------------

describe("detectPhishingSignal (deprecated keyword heuristic)", () => {
  it("returns null for a clean email", () => {
    const result = detectPhishingSignal(
      "newsletter@legitimate.com",
      "Hello! Here is your weekly digest.",
    );
    expect(result).toBeNull();
  });

  it("returns null when only trusted domains are linked (false-positive fix)", () => {
    const body =
      "Check your PR: https://github.com/org/repo — Docs: https://docs.google.com/d/abc";
    const result = detectPhishingSignal("team@focusbear.io", body);
    // With trusted domain allowlist, domain mismatch = false → no weight from domain check
    // No suspicious keywords → result should be null
    expect(result).toBeNull();
  });

  it("returns a signal for genuinely suspicious email (real mismatch + keywords)", () => {
    const body =
      "Your account has been suspended. Verify your account immediately: https://evil-phishing.com/login";
    const result = detectPhishingSignal("security@paypal.com", body);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeDefined();
  });

  it("returns high confidence for high-weight phishing signals", () => {
    const body = [
      "Your account has been suspended. Verify your account immediately.",
      "Enter your password and SSN at https://totally-fake.com/steal.",
      "Act now or lose access. Click here to verify your account.",
    ].join(" ");
    const result = detectPhishingSignal("security@real-bank.com", body);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe("high");
  });
});

// ---------------------------------------------------------------------------
// mergePhishingSignals
// ---------------------------------------------------------------------------

describe("mergePhishingSignals", () => {
  it("returns the non-null signal when one is null", () => {
    const signal = { confidence: "medium" as const, reason: "test" };
    expect(mergePhishingSignals(null, signal)).toBe(signal);
    expect(mergePhishingSignals(signal, null)).toBe(signal);
  });

  it("returns the higher-confidence signal", () => {
    const low = { confidence: "low" as const, reason: "low" };
    const high = { confidence: "high" as const, reason: "high" };
    expect(mergePhishingSignals(low, high)).toBe(high);
    expect(mergePhishingSignals(high, low)).toBe(high);
  });

  it("returns first when confidence is equal", () => {
    const signalA = { confidence: "medium" as const, reason: "a" };
    const signalB = { confidence: "medium" as const, reason: "b" };
    expect(mergePhishingSignals(signalA, signalB)).toBe(signalA);
  });
});

// ---------------------------------------------------------------------------
// validatePhishingConfidence
// ---------------------------------------------------------------------------

describe("detectDisplayNameDomainMismatch", () => {
  it("flags a brand display name sent from an unrelated domain", () => {
    const result = detectDisplayNameDomainMismatch(
      "SendGrid",
      "esmsolutions.com",
    );
    expect(result.mismatch).toBe(true);
    expect(result.detail).toContain("possible brand impersonation");
  });

  it("does not flag when the display name matches the sender domain", () => {
    expect(
      detectDisplayNameDomainMismatch("SendGrid", "sendgrid.net").mismatch,
    ).toBe(false);
    expect(
      detectDisplayNameDomainMismatch("Focus Bear", "focusbear.io").mismatch,
    ).toBe(false);
  });

  it("matches against the registered domain label on subdomains", () => {
    expect(
      detectDisplayNameDomainMismatch("PayPal", "secure.paypal.com").mismatch,
    ).toBe(false);
  });

  it("matches the brand label when the sender uses a multi-part public suffix", () => {
    expect(
      detectDisplayNameDomainMismatch("Amazon", "amazon.co.uk").mismatch,
    ).toBe(false);
    expect(
      detectDisplayNameDomainMismatch("BBC", "news.bbc.co.uk").mismatch,
    ).toBe(false);
    expect(
      detectDisplayNameDomainMismatch("Globo", "globo.com.br").mismatch,
    ).toBe(false);
  });

  it("returns no mismatch when data is missing", () => {
    expect(
      detectDisplayNameDomainMismatch(null, "esmsolutions.com").mismatch,
    ).toBe(false);
    expect(detectDisplayNameDomainMismatch("SendGrid", null).mismatch).toBe(
      false,
    );
    expect(
      detectDisplayNameDomainMismatch("   ", "esmsolutions.com").mismatch,
    ).toBe(false);
  });
});

describe("validatePhishingConfidence", () => {
  it("returns valid confidence levels", () => {
    expect(validatePhishingConfidence("low")).toBe("low");
    expect(validatePhishingConfidence("medium")).toBe("medium");
    expect(validatePhishingConfidence("high")).toBe("high");
  });

  it("returns null for invalid values", () => {
    expect(validatePhishingConfidence("extreme")).toBeNull();
    expect(validatePhishingConfidence(null)).toBeNull();
    expect(validatePhishingConfidence(undefined)).toBeNull();
    expect(validatePhishingConfidence(42)).toBeNull();
  });
});
