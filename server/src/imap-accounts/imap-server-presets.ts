export interface MailServerPreset {
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
}

import {
  IMAP_IMPLICIT_TLS_PORT as IMPLICIT_TLS_IMAP_PORT,
  SMTP_IMPLICIT_TLS_PORT as IMPLICIT_TLS_SMTP_PORT,
  SMTP_SUBMISSION_PORT as SUBMISSION_SMTP_PORT,
} from "../constants/mail-server.constants";

/**
 * Hosts whose servers don't follow the mail.<domain> convention. Gmail and
 * Outlook are absent on purpose: they connect through their OAuth providers.
 */
const KNOWN_PRESETS: Record<string, MailServerPreset> = {
  "icloud.com": {
    imapHost: "imap.mail.me.com",
    imapPort: IMPLICIT_TLS_IMAP_PORT,
    imapSecure: true,
    smtpHost: "smtp.mail.me.com",
    smtpPort: SUBMISSION_SMTP_PORT,
    smtpSecure: false,
  },
  "yahoo.com": {
    imapHost: "imap.mail.yahoo.com",
    imapPort: IMPLICIT_TLS_IMAP_PORT,
    imapSecure: true,
    smtpHost: "smtp.mail.yahoo.com",
    smtpPort: IMPLICIT_TLS_SMTP_PORT,
    smtpSecure: true,
  },
  "fastmail.com": {
    imapHost: "imap.fastmail.com",
    imapPort: IMPLICIT_TLS_IMAP_PORT,
    imapSecure: true,
    smtpHost: "smtp.fastmail.com",
    smtpPort: IMPLICIT_TLS_SMTP_PORT,
    smtpSecure: true,
  },
  "aol.com": {
    imapHost: "imap.aol.com",
    imapPort: IMPLICIT_TLS_IMAP_PORT,
    imapSecure: true,
    smtpHost: "smtp.aol.com",
    smtpPort: IMPLICIT_TLS_SMTP_PORT,
    smtpSecure: true,
  },
};

const DOMAIN_ALIASES: Record<string, string> = {
  "me.com": "icloud.com",
  "mac.com": "icloud.com",
  "yahoo.com.au": "yahoo.com",
  "ymail.com": "yahoo.com",
  "fastmail.fm": "fastmail.com",
};

/**
 * Best guess at a mailbox's servers from its address. Hosted-domain mail
 * (cPanel, Crazy Domains, most web hosts) serves both protocols from
 * mail.<domain> over SSL, so that is the default; users can override it.
 */
export function suggestMailServers(email: string): MailServerPreset | null {
  const domain = email.trim().toLowerCase().split("@")[1];
  if (!domain || !domain.includes(".")) return null;
  const preset = KNOWN_PRESETS[DOMAIN_ALIASES[domain] ?? domain];
  if (preset) return preset;
  const host = `mail.${domain}`;
  return {
    imapHost: host,
    imapPort: IMPLICIT_TLS_IMAP_PORT,
    imapSecure: true,
    smtpHost: host,
    smtpPort: IMPLICIT_TLS_SMTP_PORT,
    smtpSecure: true,
  };
}

/**
 * SMTP servers that file a copy in Sent themselves; appending our own copy
 * there would show every sent message twice.
 */
const SMTP_HOSTS_THAT_FILE_SENT_MAIL = new Set([
  "smtp.mail.me.com",
  "smtp.fastmail.com",
  "smtp.mail.yahoo.com",
  "smtp.aol.com",
]);

export function smtpServerFilesSentMail(smtpHost: string): boolean {
  return SMTP_HOSTS_THAT_FILE_SENT_MAIL.has(smtpHost.trim().toLowerCase());
}
