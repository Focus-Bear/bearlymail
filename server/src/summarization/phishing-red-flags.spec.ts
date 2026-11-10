import { PHISHING_RED_FLAGS } from "../constants/phishing.constants";
import { parseAuthenticationResults } from "../utils/authentication-results.util";
import {
  BRAND_PARTNER_MARKETING,
  ESP_NEWSLETTER,
  GENUINE_SENDGRID_SUSPENSION,
  GITHUB_VERIFY_EMAIL,
  SENDGRID_IMPERSONATION,
} from "./__fixtures__/phishing-emails.fixture";
import {
  assessPhishingRedFlags,
  detectImpersonatedBrand,
  findAccountThreats,
  findLinkTextMismatches,
  registeredDomainOf,
} from "./phishing-red-flags";
import { buildPhishingContext } from "./summarization.helpers";

const sendgridImpersonation = {
  from: SENDGRID_IMPERSONATION.from,
  fromName: SENDGRID_IMPERSONATION.fromName,
  subject: SENDGRID_IMPERSONATION.subject,
  body: SENDGRID_IMPERSONATION.body,
  htmlBody: SENDGRID_IMPERSONATION.htmlBody,
  senderAuthResults: parseAuthenticationResults(
    SENDGRID_IMPERSONATION.authenticationResultsHeader,
  ),
};

describe("phishing pre-checks — SendGrid impersonation regression", () => {
  it("flags the email even though SPF/DKIM/DMARC all pass for the sender's own domain", () => {
    const { phishingSignals } = buildPhishingContext([sendgridImpersonation]);

    expect(phishingSignals.senderAuthSummary).toBe(
      "spf=pass, dkim=pass, dmarc=pass",
    );
    expect(phishingSignals.senderDisplayName).toBe("SendGrid");
    expect(phishingSignals.redFlags).toEqual([
      PHISHING_RED_FLAGS.BRAND_IMPERSONATION,
    ]);
    expect(phishingSignals.deterministicVerdict).toEqual({
      confidence: "high",
      reason: expect.stringContaining(
        "The sender name claims to be Twilio SendGrid but the email comes from pylott.io",
      ),
    });
    expect(phishingSignals.deterministicVerdict?.reason).toContain(
      "pressures you to act to restore your account",
    );
  });

  it("reads the link domains from the HTML body, where an HTML-only email keeps them", () => {
    const { phishingSignals } = buildPhishingContext([sendgridImpersonation]);
    expect(phishingSignals.linkedDomains).toEqual(["u00000000.ct.sendgrid.net"]);
  });

  it("finds the sending-paused threat in the subject and body", () => {
    expect(
      findAccountThreats(
        `${SENDGRID_IMPERSONATION.subject}\n${SENDGRID_IMPERSONATION.body}`,
      ),
    ).toEqual([
      "account or sending paused/suspended",
      "act to restore access",
      "blocked until you act",
      "verify account/consent/details",
    ]);
  });
});

describe("phishing pre-checks — legitimate controls stay unflagged", () => {
  it.each([
    ["the real SendGrid suspending an account", GENUINE_SENDGRID_SUSPENSION],
    ["a company newsletter through SendGrid's click tracker", ESP_NEWSLETTER],
    ["a requested GitHub email verification", GITHUB_VERIFY_EMAIL],
  ])("%s has no red flags and no verdict", (_label, email) => {
    const { phishingSignals } = buildPhishingContext([email]);
    expect(phishingSignals.redFlags).toEqual([]);
    expect(phishingSignals.deterministicVerdict).toBeNull();
  });

  it("a reseller naming a partner brand is a red flag for the model, not a verdict", () => {
    const { phishingSignals } = buildPhishingContext([BRAND_PARTNER_MARKETING]);
    expect(phishingSignals.redFlags).toEqual([
      PHISHING_RED_FLAGS.BRAND_IMPERSONATION,
    ]);
    expect(phishingSignals.deterministicVerdict).toBeNull();
  });
});

describe("detectImpersonatedBrand", () => {
  it.each([
    ["PayPal", "service@paypal.com.au"],
    ["Microsoft Teams", "no-reply@teams.mail.microsoft"],
    ["Google Workspace", "workspace-noreply@google.com"],
    ["Amazon Web Services", "aws-marketing@amazon.com"],
  ])("accepts %s from its own domain (%s)", (name, address) => {
    expect(detectImpersonatedBrand(name, address.split("@")[1])).toBeNull();
  });

  it("flags a brand name on a lookalike domain", () => {
    expect(
      detectImpersonatedBrand("PayPal Security", "paypal-support-center.ru")
        ?.brand,
    ).toBe("PayPal");
  });

  it("matches brand names as whole words only", () => {
    expect(detectImpersonatedBrand("Pineapple Studio", "pineapple.test")).toBe(
      null,
    );
  });
});

describe("findLinkTextMismatches", () => {
  it("flags anchor text showing one domain while the link opens another", () => {
    expect(
      findLinkTextMismatches(
        `<a href="https://login.evil.example.test/x">https://www.paypal.com/signin</a>`,
      ),
    ).toEqual([
      { shownDomain: "paypal.com", linkedDomain: "example.test" },
    ]);
  });

  it("ignores click trackers and mail-security proxies", () => {
    expect(
      findLinkTextMismatches(
        `<a href="https://nam02.safelinks.protection.outlook.com/?url=x">acme.com</a>`,
      ),
    ).toEqual([]);
  });

  it("ignores text that only looks like a filename", () => {
    expect(
      findLinkTextMismatches(
        `<a href="https://files.example.test/r">report.pdf</a>`,
      ),
    ).toEqual([]);
  });

  it("treats subdomains of the same registered domain as matching", () => {
    expect(
      findLinkTextMismatches(
        `<a href="https://mail.paypal.com.au/x">www.paypal.com.au</a>`,
      ),
    ).toEqual([]);
  });
});

describe("assessPhishingRedFlags — decision rule", () => {
  const baseInput = {
    senderDomain: "acme.example.test",
    fromName: "Acme",
    subject: "Action required",
    body: "Your account has been suspended. Restore your account now.",
  };

  it("a disguised link plus an account threat is high confidence", () => {
    const result = assessPhishingRedFlags({
      ...baseInput,
      htmlBody: `<a href="https://evil.example.org/x">www.acme.example.test</a>`,
    });
    expect(result.redFlags).toEqual([PHISHING_RED_FLAGS.LINK_TEXT_MISMATCH]);
    expect(result.verdict?.confidence).toBe("high");
  });

  it("failed sender authentication plus an account threat is medium confidence", () => {
    const result = assessPhishingRedFlags({
      ...baseInput,
      senderAuthResults: { spf: "fail", dkim: "none", dmarc: "fail" },
    });
    expect(result.redFlags).toEqual([PHISHING_RED_FLAGS.AUTH_FAILURE]);
    expect(result.verdict).toEqual({
      confidence: "medium",
      reason: expect.stringContaining(
        "failed sender authentication (spf=fail, dkim=none, dmarc=fail)",
      ),
    });
  });

  it("failed authentication alone (e.g. a forwarded email) is left to the model", () => {
    const result = assessPhishingRedFlags({
      ...baseInput,
      body: "Minutes from Tuesday's meeting attached.",
      subject: "Minutes",
      senderAuthResults: { dmarc: "fail" },
    });
    expect(result.redFlags).toEqual([PHISHING_RED_FLAGS.AUTH_FAILURE]);
    expect(result.verdict).toBeNull();
  });

  it("an account threat alone from the sender's own domain is left to the model", () => {
    const result = assessPhishingRedFlags(baseInput);
    expect(result.redFlags).toEqual([]);
    expect(result.accountThreats.length).toBeGreaterThan(0);
    expect(result.verdict).toBeNull();
  });
});

describe("registeredDomainOf", () => {
  it.each([
    ["secure.paypal.com", "paypal.com"],
    ["mail.paypal.com.au", "paypal.com.au"],
    ["teams.mail.microsoft", "mail.microsoft"],
    ["example.test", "example.test"],
  ])("%s → %s", (host, expected) => {
    expect(registeredDomainOf(host)).toBe(expected);
  });
});
