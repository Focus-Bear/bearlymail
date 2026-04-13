/**
 * Sender classification constants used by CategoryRulesService.
 * Extracted to keep the service file within the 800-line lint limit.
 */

export const GENERIC_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "protonmail.com",
  "proton.me",
  "aol.com",
  "yandex.com",
  "yandex.ru",
  "mail.com",
  "zoho.com",
  "fastmail.com",
]);

export const AUTOMATED_PREFIXES = [
  "noreply@",
  "no-reply@",
  "notifications@",
  "notification@",
  "alerts@",
  "alert@",
  "do-not-reply@",
  "donotreply@",
  "mailer@",
  "bounces@",
  "postmaster@",
  "support@",
  "info@",
  "hello@",
  "news@",
  "newsletter@",
];

export const SUBJECT_PREFIX_REGEX = /^\[([^\]]{1,30})\]/;
