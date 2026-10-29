/**
 * Sender and subject patterns for mail that no real person wrote: system
 * notifications, newsletters and transactional mail. Shared by the
 * auto-responder (never reply to these) and FAQ learning (never treat them as
 * questions people ask).
 */

/** Senders that are machines: no-reply addresses, alerts, helpdesk relays. */
export const AUTOMATED_SENDER_PATTERNS: readonly RegExp[] = [
  /^noreply@/i,
  /^no-reply@/i,
  /^donotreply@/i,
  /^do-not-reply@/i,
  /^mailer-daemon@/i,
  /^postmaster@/i,
  /^notifications?@/i,
  /^alerts?@/i,
  /^auto@/i,
  /^automated@/i,
  /^system@/i,
  /^support@.*\.(zendesk|freshdesk|intercom|helpscout)/i,
  /^.*@.*\.notifications\./i,
];

/** Subjects of auto-replies, bounces and receipts-of-delivery. */
export const AUTOMATED_SUBJECT_PATTERNS: readonly RegExp[] = [
  /\[auto(-)?reply\]/i,
  /automatic reply/i,
  /out of (the )?office/i,
  /auto(-)?response/i,
  /delivery (status )?notification/i,
  /undeliverable/i,
  /read receipt/i,
  /return receipt/i,
];

/** Bulk-mail platforms and list addresses. */
export const NEWSLETTER_SENDER_PATTERNS: readonly RegExp[] = [
  /@.*mail\.(mailchimp|constantcontact|sendgrid|mailgun|convertkit)/i,
  /@.*\.substack\.com$/i,
  /newsletter@/i,
  /digest@/i,
  /updates@/i,
  /marketing@/i,
  /promo(tions)?@/i,
];

export const NEWSLETTER_SUBJECT_PATTERNS: readonly RegExp[] = [
  /\bunsubscribe\b/i,
  /\bweekly digest\b/i,
  /\bdaily digest\b/i,
  /\bnewsletter\b/i,
  /\bmonthly update\b/i,
];

/** Receipts, invoices, orders and account mail sent by systems. */
export const TRANSACTIONAL_SENDER_PATTERNS: readonly RegExp[] = [
  /^(billing|invoices?|receipts?|orders?|payments?|accounts?|statements?|shipping|delivery)@/i,
  /^(calendar|calendar-notification|calendar-server)@/i,
];

export const TRANSACTIONAL_SUBJECT_PATTERNS: readonly RegExp[] = [
  /\b(receipt|invoice|order confirmation|your order|payment (received|confirmation)|(account|monthly|your) statement)\b/i,
  /\b(invitation|updated invitation|accepted|declined|tentative):/i,
  /\bverify your (email|account)\b/i,
  /\b(password reset|reset your password|sign-?in code|verification code)\b/i,
];

export function matchesAnyPattern(
  value: string,
  patterns: readonly RegExp[],
): boolean {
  return patterns.some((pattern) => pattern.test(value));
}
