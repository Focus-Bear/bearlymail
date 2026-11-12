/**
 * Registries for the deterministic phishing pre-checks
 * (summarization/phishing-red-flags.ts). The LLM still judges every email these
 * checks do not settle; these lists only have to be precise, not complete.
 */

/** Values an `Authentication-Results` header reports for SPF, DKIM and DMARC. */
export const AUTH_RESULT_VALUES = {
  PASS: "pass",
  FAIL: "fail",
  SOFTFAIL: "softfail",
  NEUTRAL: "neutral",
  NONE: "none",
  TEMPERROR: "temperror",
  PERMERROR: "permerror",
} as const;

export type AuthResultValue =
  (typeof AUTH_RESULT_VALUES)[keyof typeof AUTH_RESULT_VALUES];

export const AUTH_METHODS = {
  SPF: "spf",
  DKIM: "dkim",
  DMARC: "dmarc",
} as const;

export type AuthMethod = (typeof AUTH_METHODS)[keyof typeof AUTH_METHODS];

/** Deterministic red flags. Values are shown to the model and in banner reasons. */
export const PHISHING_RED_FLAGS = {
  BRAND_IMPERSONATION: "brand impersonation",
  AUTH_FAILURE: "sender authentication failed",
  LINK_TEXT_MISMATCH: "link text shows a different domain than the link opens",
} as const;

export type PhishingRedFlag =
  (typeof PHISHING_RED_FLAGS)[keyof typeof PHISHING_RED_FLAGS];

/**
 * A brand that phishing commonly impersonates, and every domain its real mail
 * comes from. `names` are matched as whole words in the sender display name, so
 * they must not be common first names or words (no "Chase", "Square", "Meta").
 */
export interface ImpersonatedBrand {
  brand: string;
  names: readonly string[];
  domains: readonly string[];
}

export const IMPERSONATED_BRANDS: readonly ImpersonatedBrand[] = [
  {
    brand: "Twilio SendGrid",
    names: ["sendgrid", "twilio"],
    domains: [
      "sendgrid.com",
      "sendgrid.net",
      "twilio.com",
      "segment.com",
      "segment.io",
    ],
  },
  {
    brand: "Mailchimp",
    names: ["mailchimp"],
    domains: ["mailchimp.com", "mcsv.net", "mcdlv.net", "intuit.com"],
  },
  {
    brand: "PayPal",
    names: ["paypal"],
    domains: [
      "paypal.com",
      "paypal.com.au",
      "paypal.co.uk",
      "paypal.de",
      "paypal.ca",
      "paypal.fr",
      "paypal.es",
      "paypal.it",
      "paypal.nl",
    ],
  },
  {
    brand: "Microsoft",
    names: [
      "microsoft",
      "office 365",
      "microsoft 365",
      "onedrive",
      "sharepoint",
    ],
    domains: [
      "microsoft.com",
      "office.com",
      "office365.com",
      "outlook.com",
      "sharepoint.com",
      "onmicrosoft.com",
      "microsoftonline.com",
      "live.com",
      "hotmail.com",
      "azure.com",
      // SharePoint and OneDrive sharing notifications
      "sharepointonline.com",
      // Microsoft's own gTLD, e.g. teams.mail.microsoft
      "microsoft",
    ],
  },
  {
    brand: "Google",
    names: ["google", "gmail"],
    domains: [
      "google.com",
      "gmail.com",
      "youtube.com",
      "googlemail.com",
      "googlegroups.com",
      "google",
    ],
  },
  {
    brand: "Apple",
    names: ["apple", "icloud", "itunes"],
    domains: ["apple.com", "icloud.com", "me.com"],
  },
  {
    brand: "Amazon",
    names: ["amazon", "aws"],
    domains: [
      "amazon.com",
      "amazon.com.au",
      "amazon.co.uk",
      "amazon.ca",
      "amazon.de",
      "amazonaws.com",
      "aws.com",
      "amazonses.com",
      "awsevents.com",
      "amazon",
    ],
  },
  {
    brand: "Stripe",
    names: ["stripe"],
    domains: ["stripe.com"],
  },
  {
    brand: "DocuSign",
    names: ["docusign"],
    domains: ["docusign.com", "docusign.net"],
  },
  {
    brand: "Dropbox",
    names: ["dropbox"],
    domains: ["dropbox.com", "dropboxmail.com"],
  },
  {
    brand: "LinkedIn",
    names: ["linkedin"],
    domains: ["linkedin.com"],
  },
  {
    brand: "Netflix",
    names: ["netflix"],
    domains: ["netflix.com"],
  },
  {
    brand: "Coinbase",
    names: ["coinbase"],
    domains: ["coinbase.com"],
  },
  {
    brand: "Adobe",
    names: ["adobe"],
    // Adobe Acrobat Sign (formerly EchoSign) sends signature requests from its own domains
    domains: ["adobe.com", "adobesign.com", "echosign.com"],
  },
  {
    brand: "Xero",
    names: ["xero"],
    domains: ["xero.com"],
  },
  {
    brand: "Commonwealth Bank",
    names: ["commonwealth bank", "commbank"],
    domains: ["commbank.com.au", "cba.com.au"],
  },
];

/**
 * Link-rewriting services (ESP click tracking, mail-security proxies). Their
 * links never show the destination domain, so a visible-text/href mismatch
 * through one of them is normal and not a red flag.
 */
export const LINK_REWRITE_DOMAINS: ReadonlySet<string> = new Set([
  "sendgrid.net",
  "list-manage.com",
  "mailchimp.com",
  "mandrillapp.com",
  "mailgun.org",
  "sparkpostmail.com",
  "hubspotlinks.com",
  "hs-sites.com",
  "awstrack.me",
  "createsend1.com",
  "cmail19.com",
  "cmail20.com",
  "customeriomail.com",
  "mlsend.com",
  "klclick.com",
  "outlook.com",
  "urldefense.com",
  "mimecast.com",
  "google.com",
]);

/**
 * Second-level labels of multi-part public suffixes (".co.uk", ".com.au"). The
 * registered domain of "paypal.com.au" is all three labels, not "com.au".
 */
export const MULTI_PART_SUFFIX_LABELS: ReadonlySet<string> = new Set([
  "co",
  "com",
  "org",
  "net",
  "gov",
  "edu",
  "ac",
]);

/**
 * Top-level domains a bare anchor text like "paypal.com" must end in to count
 * as a visible domain. Without a scheme or "www." prefix, text such as
 * "report.pdf" would otherwise read as a hostname.
 */
export const LINK_TEXT_TLDS: ReadonlySet<string> = new Set([
  "com",
  "net",
  "org",
  "io",
  "co",
  "au",
  "uk",
  "nz",
  "ca",
  "us",
  "de",
  "gov",
  "edu",
  "info",
  "biz",
  "app",
  "dev",
  "ai",
  "me",
]);
