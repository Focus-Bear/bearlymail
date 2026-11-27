import { PHISHING_RED_FLAGS } from "../constants/phishing.constants";
import { parseAuthenticationResults } from "../utils/authentication-results.util";
import {
  BRAND_PARTNER_MARKETING,
  ESP_NEWSLETTER,
  GENUINE_SENDGRID_SUSPENSION,
  GENUINE_SENDGRID_TWO_FACTOR_NOTICE,
  GITHUB_VERIFY_EMAIL,
  SENDGRID_IMPERSONATION,
  SENDGRID_SUPPORT_CHAT_LURE,
} from "./__fixtures__/phishing-emails.fixture";
import {
  assessPhishingRedFlags,
  detectImpersonatedBrand,
  findAccountThreats,
  findLinkTextMismatches,
  findOffBrandLinkDomains,
  findSecurityLures,
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
    expect(phishingSignals.linkedDomains).toEqual([
      "u00000000.ct.sendgrid.net",
    ]);
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
    [
      "the real SendGrid's two-factor change notice",
      GENUINE_SENDGRID_TWO_FACTOR_NOTICE,
    ],
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

describe("phishing pre-checks — SendGrid support-chat pretext regression (2026-11-20_16-24-28)", () => {
  const { phishingSignals } = buildPhishingContext([
    SENDGRID_SUPPORT_CHAT_LURE,
  ]);

  it("decides high confidence although there is no threat and auth passes", () => {
    expect(phishingSignals.accountThreats).toEqual([]);
    expect(phishingSignals.senderAuthSummary).toBe(
      "spf=pass, dkim=pass, dmarc=pass",
    );
    expect(phishingSignals.deterministicVerdict?.confidence).toBe("high");
  });

  it("explains the impersonation and the pretext in the banner reason", () => {
    const reason = phishingSignals.deterministicVerdict?.reason ?? "";
    expect(reason).toContain(
      "The sender name claims to be Twilio SendGrid but the email comes from foundryhealth.com",
    );
    expect(reason).toContain("account-security pretext");
    expect(reason).toContain(
      "its links go to example.org, not Twilio SendGrid",
    );
  });

  it("flags the brand impersonation and the off-brand link for the model", () => {
    expect(phishingSignals.redFlags).toEqual([
      PHISHING_RED_FLAGS.BRAND_IMPERSONATION,
      PHISHING_RED_FLAGS.OFF_BRAND_LINK,
    ]);
    expect(phishingSignals.offBrandLinkDomains).toEqual(["example.org"]);
  });

  it("finds every account-security pretext in the subject and body", () => {
    expect(
      findSecurityLures(
        `${SENDGRID_SUPPORT_CHAT_LURE.subject}\n${SENDGRID_SUPPORT_CHAT_LURE.body}`,
      ),
    ).toEqual([
      "two-factor or security settings",
      "if this was not you",
      "quotes your account details",
      "a support conversation about your account",
    ]);
  });

  it.each([
    ["sendgrid.net", "bounces.sendgrid.net"],
    ["sendgrid.com", "sendgrid.com"],
    ["twilio.com", "mail.twilio.com"],
  ])(
    "does not flag the same email sent from SendGrid's own %s",
    (_label, domain) => {
      const assessment = assessPhishingRedFlags({
        senderDomain: domain,
        fromName: SENDGRID_SUPPORT_CHAT_LURE.fromName,
        subject: SENDGRID_SUPPORT_CHAT_LURE.subject,
        body: SENDGRID_SUPPORT_CHAT_LURE.body ?? "",
      });
      expect(assessment.redFlags).toEqual([]);
      expect(assessment.verdict).toBeNull();
    },
  );

  it("flags it from a lookalike domain", () => {
    const assessment = assessPhishingRedFlags({
      senderDomain: "sendgrid-support.com",
      fromName: "SendGrid Support",
      subject: SENDGRID_SUPPORT_CHAT_LURE.subject,
      body: SENDGRID_SUPPORT_CHAT_LURE.body ?? "",
    });
    expect(assessment.impersonatedBrand).toBe("Twilio SendGrid");
    expect(assessment.verdict?.confidence).toBe("high");
  });

  it("flags a DMARC failure on the impersonating sender", () => {
    const assessment = assessPhishingRedFlags({
      senderDomain: "foundryhealth.com",
      fromName: "SendGrid",
      subject: "Your invoice",
      body: "Your monthly invoice is attached.",
      senderAuthResults: { spf: "pass", dkim: "none", dmarc: "fail" },
    });
    expect(assessment.redFlags).toEqual([
      PHISHING_RED_FLAGS.BRAND_IMPERSONATION,
      PHISHING_RED_FLAGS.AUTH_FAILURE,
    ]);
    expect(assessment.verdict?.confidence).toBe("high");
  });

  it("one pretext alone from a brand partner is left to the model", () => {
    const assessment = assessPhishingRedFlags({
      senderDomain: "contoso.example.test",
      fromName: "Contoso – Microsoft Partner",
      subject: "Webinar: rolling out multi-factor authentication",
      body: "Join our webinar on rolling out multi-factor authentication.",
      htmlBody: `<a href="https://events.example.org/mfa">Register</a>`,
    });
    expect(assessment.securityLures).toEqual([
      "two-factor or security settings",
    ]);
    expect(assessment.redFlags).toEqual([
      PHISHING_RED_FLAGS.BRAND_IMPERSONATION,
      PHISHING_RED_FLAGS.OFF_BRAND_LINK,
    ]);
    expect(assessment.verdict).toBeNull();
  });

  it("leaves a mailing list relaying a real security notice to the model", () => {
    const assessment = assessPhishingRedFlags({
      senderDomain: "acme.example.test",
      fromName: "GitHub via Engineering",
      subject: "[GitHub] Two-factor authentication disabled",
      body: "Two-factor authentication was disabled for your account. If this was not you, review your security settings.",
      htmlBody: `<a href="https://github.com/settings/security">Review settings</a>`,
    });
    expect(assessment.impersonatedBrand).toBe("GitHub");
    expect(assessment.securityLures).toEqual([
      "two-factor or security settings",
      "if this was not you",
    ]);
    expect(assessment.redFlags).toEqual([
      PHISHING_RED_FLAGS.BRAND_IMPERSONATION,
    ]);
    expect(assessment.verdict).toBeNull();
  });

  it("still decides other red flags for a sender relayed 'via' a list", () => {
    const assessment = assessPhishingRedFlags({
      senderDomain: "foundryhealth.com",
      fromName: "SendGrid via Support",
      subject: SENDGRID_SUPPORT_CHAT_LURE.subject,
      body: SENDGRID_SUPPORT_CHAT_LURE.body ?? "",
      senderAuthResults: { spf: "pass", dkim: "none", dmarc: "fail" },
    });
    expect(assessment.verdict?.confidence).toBe("high");
  });
});

describe("findOffBrandLinkDomains", () => {
  const sendgrid = detectImpersonatedBrand("SendGrid", "foundryhealth.com");

  it("ignores the brand's own domains, the sender's domain and click trackers", () => {
    expect(
      findOffBrandLinkDomains(sendgrid, "foundryhealth.com", [
        "app.sendgrid.com",
        "www.twilio.com",
        "links.foundryhealth.com",
        "u0.ct.sendgrid.net",
        "nam02.safelinks.protection.outlook.com",
      ]),
    ).toEqual([]);
  });

  it("lists other domains once each", () => {
    expect(
      findOffBrandLinkDomains(sendgrid, "foundryhealth.com", [
        "a.chat-summary.example.org",
        "b.chat-summary.example.org",
      ]),
    ).toEqual(["example.org"]);
  });

  it("is empty when the display name claims no brand", () => {
    expect(
      findOffBrandLinkDomains(null, "acme.example.test", ["evil.example.org"]),
    ).toEqual([]);
  });
});

describe("detectImpersonatedBrand", () => {
  it.each([
    ["PayPal", "service@paypal.com.au"],
    ["Microsoft Teams", "no-reply@teams.mail.microsoft"],
    ["Google Workspace", "workspace-noreply@google.com"],
    ["Amazon Web Services", "aws-marketing@amazon.com"],
    ["Jane Doe via Adobe Acrobat Sign", "adobesign@adobesign.com"],
    ["SharePoint Online", "no-reply@sharepointonline.com"],
    ["PayPal", "service@paypal.ca"],
  ])("accepts %s from its own domain (%s)", (name, address) => {
    expect(detectImpersonatedBrand(name, address.split("@")[1])).toBeNull();
  });

  it.each([
    [
      "an Adobe Sign request asking to verify identity",
      {
        fromName: "Jane Doe via Adobe Acrobat Sign",
        senderDomain: "adobesign.com",
        body: "Jane sent you a document. Verify your identity to sign it.",
      },
    ],
    [
      "a SharePoint notice about restricted access",
      {
        fromName: "SharePoint Online",
        senderDomain: "sharepointonline.com",
        body: "Access to this file is restricted to people in Acme.",
      },
    ],
    [
      "PayPal Canada limiting an account",
      {
        fromName: "PayPal",
        senderDomain: "paypal.ca",
        body: "Your account access is restricted until you verify your details.",
      },
    ],
  ])("does not flag %s from the brand's own domain", (_label, email) => {
    const assessment = assessPhishingRedFlags(email);
    expect(assessment.redFlags).toEqual([]);
    expect(assessment.verdict).toBeNull();
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
  it("stays fast on thousands of unclosed anchors", () => {
    const html = '<a href="x">'.repeat(20_000);
    const start = Date.now();

    expect(findLinkTextMismatches(html)).toEqual([]);

    expect(Date.now() - start).toBeLessThan(2000);
  });

  it("flags anchor text showing one domain while the link opens another", () => {
    expect(
      findLinkTextMismatches(
        `<a href="https://login.evil.example.test/x">https://www.paypal.com/signin</a>`,
      ),
    ).toEqual([{ shownDomain: "paypal.com", linkedDomain: "example.test" }]);
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
