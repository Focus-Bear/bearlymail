/**
 * Phishing regression fixtures.
 *
 * SENDGRID_IMPERSONATION is a redacted copy of a real phishing email that the
 * check passed: display name "SendGrid", sent from an unrelated domain that
 * passes SPF/DKIM/DMARC for itself, links routed through SendGrid's real click
 * tracker, and a "sending is paused" threat. The recipient is replaced, link
 * paths and tracking tokens are removed, and the body is shortened; the sender
 * domain and the click-tracker domain are kept because they ARE the signal.
 *
 * The controls are invented legitimate mail that must stay unflagged.
 */

import type { PhishingContextEmail } from "../summarization.helpers";

const REDACTED_RECIPIENT = "user@example.test";
const REDACTED_CLICK_LINK = "https://u00000000.ct.sendgrid.net/ls/click";

export const SENDGRID_IMPERSONATION = {
  from: "noreply@pylott.io",
  fromName: "SendGrid",
  subject: "GDPR compliance error: verify consent to resume sending",
  authenticationResultsHeader: `mx.google.com; dkim=pass header.i=@pylott.io header.s=s1; spf=pass (google.com: domain of bounces@em0000.pylott.io designates 192.0.2.1 as permitted sender) smtp.mailfrom="bounces+${REDACTED_RECIPIENT}@em0000.pylott.io"; dmarc=pass (p=NONE sp=NONE dis=NONE) header.from=pylott.io`,
  // Gmail stores an HTML-only email's text body as the tag-stripped HTML, so
  // the hrefs are NOT in it — only htmlBody carries the links.
  body: [
    "Email sending is paused",
    "A GDPR compliance error is blocking this account. Marketing email needs valid consent, and you need records that can prove it.",
    "This is your duty on SendGrid. SendGrid delivers the message. Your account chooses the recipients, so the consent and the records have to be yours.",
    "Before sending can resume, both of the following need to be true:",
    "You will not be able to send emails until this is resolved.",
    "Start verification",
    "Twilio SendGrid",
  ].join("\n"),
  htmlBody: `<html><body>
<h1>Email sending is paused</h1>
<p>A GDPR compliance error is blocking this account. Marketing email needs valid consent, and you need records that can prove it.</p>
<p>This is your duty on SendGrid. SendGrid delivers the message. Your account chooses the recipients, so the consent and the records have to be yours.</p>
<td>You will not be able to send emails until this is resolved.</td>
<a href="${REDACTED_CLICK_LINK}" style="color:#ffffff;">Start verification</a>
<p>Twilio SendGrid</p>
<a href="${REDACTED_CLICK_LINK}">Help</a> | <a href="${REDACTED_CLICK_LINK}">Privacy</a>
</body></html>`,
} as const;

/**
 * Synthesised from a screenshot of a second miss (report 2026-11-20_16-24-28):
 * "SendGrid <noreply@foundryhealth.com>" following up on a "support chat" that
 * quoted the account's details and asked to change two-factor settings, with a
 * link to a "summary". No threat and no urgency, so none of the account-threat
 * patterns matched and the model cleared it as a security notice. The real
 * link was not visible, so the summary link uses a reserved test domain.
 */
const SUPPORT_CHAT_SUMMARY_LINK = "https://chat-summary.example.org/s/0000";

export const SENDGRID_SUPPORT_CHAT_LURE: PhishingContextEmail = {
  from: "noreply@foundryhealth.com",
  fromName: "SendGrid",
  subject: "Following up on your recent support chat",
  body: [
    "Following up on your November 18 support chat.",
    "Hello,",
    "A chat session with SendGrid Support on November 18 at 15:26 UTC referenced your account number, plan details, and billing ZIP code, and asked about changing the two-factor authentication settings on the account. The person in the chat was not signed in at the time.",
    "Our agents are unable to make changes of that kind without an authenticated session, so nothing on the account was modified. Since the chat included correct account details, we wanted to make you aware of it in case it was not you or someone on your team.",
    "Details like these are often gathered from an old invoice, a forwarded receipt, or a public listing. If the chat was not yours, it may be worth checking who still has access to those.",
    "A summary of the chat, including what was asked and which details were provided, is available here:",
    "View chat summary",
  ].join("\n"),
  htmlBody: `<html><body>
<p><b>Following up on your November 18 support chat.</b></p>
<p>A chat session with SendGrid Support on November 18 at 15:26 UTC referenced your account number, plan details, and billing ZIP code, and asked about changing the two-factor authentication settings on the account.</p>
<p>A summary of the chat, including what was asked and which details were provided, is available here:</p>
<a href="${SUPPORT_CHAT_SUMMARY_LINK}">View chat summary</a>
</body></html>`,
  senderAuthResults: { spf: "pass", dkim: "pass", dmarc: "pass" },
};

/** The real SendGrid, from its own domain, with the same kind of threat. */
export const GENUINE_SENDGRID_SUSPENSION: PhishingContextEmail = {
  from: "noreply@sendgrid.com",
  fromName: "Twilio SendGrid",
  subject: "Your account has been suspended",
  body: "Your account has been suspended for a high bounce rate. Sending will resume once you review your lists.",
  htmlBody: `<p>Your account has been suspended.</p><a href="https://app.sendgrid.com/settings">app.sendgrid.com</a>`,
};

/** A company's own newsletter sent through SendGrid's click tracker. */
export const ESP_NEWSLETTER: PhishingContextEmail = {
  from: "news@acme.example.test",
  fromName: "Acme Weekly",
  subject: "This week at Acme",
  body: "Read the latest from the Acme blog.",
  htmlBody: `<p>Read the latest.</p><a href="${REDACTED_CLICK_LINK}">www.acme.example.test/blog</a>`,
};

/** A reseller naming a brand it partners with: a red flag, not a verdict. */
export const BRAND_PARTNER_MARKETING: PhishingContextEmail = {
  from: "hello@contoso.example.test",
  fromName: "Contoso – Microsoft Partner",
  subject: "Get more from your licences",
  body: "Join our webinar on getting the most out of your licences.",
  htmlBody: `<a href="https://contoso.example.test/webinar">Register</a>`,
};

/** A real two-factor change notice from SendGrid's own domain. */
export const GENUINE_SENDGRID_TWO_FACTOR_NOTICE: PhishingContextEmail = {
  from: "no-reply@sendgrid.com",
  fromName: "Twilio SendGrid",
  subject: "Two-factor authentication settings changed",
  body: "The two-factor authentication settings on your account were changed. If this was not you, contact support.",
  htmlBody: `<a href="https://app.sendgrid.com/settings/auth">Review security settings</a> <a href="https://www.twilio.com/legal/privacy">Privacy</a>`,
  senderAuthResults: { spf: "pass", dkim: "pass", dmarc: "pass" },
};

/** A requested email-verification message from the real service. */
export const GITHUB_VERIFY_EMAIL: PhishingContextEmail = {
  from: "noreply@github.com",
  fromName: "GitHub",
  subject: "[GitHub] Please verify your email address",
  body: "Please verify your email address to finish setting up your account.",
  htmlBody: `<a href="https://github.com/users/confirm">Verify email address</a>`,
};
