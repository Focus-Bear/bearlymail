import { randomUUID } from "crypto";
import { createTransport } from "nodemailer";
import addressparser from "nodemailer/lib/addressparser";
import MailComposer from "nodemailer/lib/mail-composer";

import {
  MAIL_CONNECTION_TIMEOUT_MS,
  MAIL_GREETING_TIMEOUT_MS,
  SMTP_SOCKET_TIMEOUT_MS,
} from "../constants/mail-server.constants";
import type { EmailAttachmentData } from "../emails/interfaces/email-provider.interface";
import { formatMessageIdHeader } from "../emails/providers/rfc822/rfc822-threading";
import { ALLOWED_SMTP_PORTS, resolveMailServer } from "./mail-server-address";

const SMTP_TIMEOUTS = {
  CONNECTION: MAIL_CONNECTION_TIMEOUT_MS,
  GREETING: MAIL_GREETING_TIMEOUT_MS,
  SOCKET: SMTP_SOCKET_TIMEOUT_MS,
} as const;

export interface SmtpServerSettings {
  host: string;
  port: number;
  /** true = implicit TLS (465); false = STARTTLS, which we then require. */
  secure: boolean;
  username: string;
  password: string;
}

export interface OutgoingMessage {
  from: { email: string; name?: string };
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: EmailAttachmentData[];
  /** Bare message IDs; set for replies so every client threads them. */
  inReplyTo?: string;
  references?: string[];
}

export interface ComposedMessage {
  messageId: string;
  raw: Buffer;
  /** Envelope recipients, including Bcc (which is stripped from `raw`). */
  recipients: string[];
}

/**
 * SMTP RCPT TO takes bare addresses; headers keep "Name <addr>" as given.
 * Splitting each field also handles callers that pass "a@x, b@y" as one entry.
 */
function envelopeAddresses(fields: string[]): string[] {
  return fields
    .flatMap((field) => addressparser(field, { flatten: true }))
    .map((entry) => entry.address)
    .filter(Boolean);
}

function messageIdFor(fromEmail: string): string {
  const domain = fromEmail.split("@")[1] || "bearlymail.local";
  return `${randomUUID()}@${domain}`;
}

/**
 * Builds the RFC-822 message once so the exact bytes we send over SMTP are
 * also what we append to the Sent folder.
 */
export async function composeMessage(
  message: OutgoingMessage,
): Promise<ComposedMessage> {
  const messageId = messageIdFor(message.from.email);
  const composer = new MailComposer({
    messageId: `<${messageId}>`,
    from: message.from.name
      ? { name: message.from.name, address: message.from.email }
      : message.from.email,
    to: message.to,
    cc: message.cc,
    subject: message.subject,
    text: message.text,
    html: message.html,
    inReplyTo: message.inReplyTo
      ? formatMessageIdHeader([message.inReplyTo])
      : undefined,
    references: message.references?.length
      ? formatMessageIdHeader(message.references)
      : undefined,
    attachments: message.attachments?.map((attachment) => ({
      filename: attachment.filename,
      contentType: attachment.mimeType,
      content: attachment.content,
      cid: attachment.contentId,
    })),
  });
  const raw = await composer.compile().build();
  return {
    messageId,
    raw,
    recipients: envelopeAddresses([
      ...message.to,
      ...(message.cc || []),
      ...(message.bcc || []),
    ]),
  };
}

async function createSmtpTransport(
  settings: SmtpServerSettings,
  options: { allowPrivateHosts: boolean },
) {
  const server = await resolveMailServer(settings.host, settings.port, {
    allowedPorts: ALLOWED_SMTP_PORTS,
    allowPrivate: options.allowPrivateHosts,
  });
  return createTransport({
    // Connect to the vetted IP; servername keeps certificate checks on the
    // hostname the user entered.
    host: server.address,
    port: server.port,
    secure: settings.secure,
    // Never fall back to plaintext: the password crosses this connection.
    requireTLS: !settings.secure,
    tls: { servername: server.hostname },
    auth: { user: settings.username, pass: settings.password },
    connectionTimeout: SMTP_TIMEOUTS.CONNECTION,
    greetingTimeout: SMTP_TIMEOUTS.GREETING,
    socketTimeout: SMTP_TIMEOUTS.SOCKET,
  });
}

export async function sendComposedMessage(
  settings: SmtpServerSettings,
  options: { allowPrivateHosts: boolean },
  fromEmail: string,
  composed: ComposedMessage,
): Promise<void> {
  const transport = await createSmtpTransport(settings, options);
  try {
    await transport.sendMail({
      envelope: { from: fromEmail, to: composed.recipients },
      raw: composed.raw,
    });
  } finally {
    transport.close();
  }
}

/** Logs in to the SMTP server without sending, to validate settings. */
export async function verifySmtpSettings(
  settings: SmtpServerSettings,
  options: { allowPrivateHosts: boolean },
): Promise<void> {
  const transport = await createSmtpTransport(settings, options);
  try {
    await transport.verify();
  } finally {
    transport.close();
  }
}
