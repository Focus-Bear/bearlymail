import { ImapFlow, type ListResponse } from "imapflow";

import {
  IMAP_SOCKET_TIMEOUT_MS,
  MAIL_CONNECTION_TIMEOUT_MS,
  MAIL_GREETING_TIMEOUT_MS,
} from "../constants/mail-server.constants";
import { ALLOWED_IMAP_PORTS, resolveMailServer } from "./mail-server-address";

/** Bounds every phase so a dead server can't stall a sync worker. */
const IMAP_TIMEOUTS = {
  CONNECTION: MAIL_CONNECTION_TIMEOUT_MS,
  GREETING: MAIL_GREETING_TIMEOUT_MS,
  SOCKET: IMAP_SOCKET_TIMEOUT_MS,
} as const;

export const INBOX_MAILBOX = "INBOX";

const SPECIAL_USE = {
  ARCHIVE: "\\Archive",
  SENT: "\\Sent",
  TRASH: "\\Trash",
} as const;

/**
 * Names servers without SPECIAL-USE (RFC 6154) give these folders. cPanel /
 * Courier hosts (Crazy Domains among them) nest everything under "INBOX.".
 */
const FALLBACK_NAMES = {
  ARCHIVE: ["archive", "archives"],
  SENT: ["sent", "sent items", "sent messages", "sent mail"],
  TRASH: ["trash", "deleted items", "deleted messages", "bin"],
} as const;

const DEFAULT_ARCHIVE_NAME = "Archive";

export interface ImapServerSettings {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
}

export interface SpecialMailboxes {
  archive: string | null;
  sent: string | null;
  trash: string | null;
}

export interface ImapSessionOptions {
  /** Self-hosted deployments may legitimately use localhost bridges. */
  allowPrivateHosts: boolean;
  /** Overrides the connect/greeting timeouts, e.g. while probing candidate hosts. */
  timeoutMs?: number;
}

async function openImapSession(
  settings: ImapServerSettings,
  options: ImapSessionOptions,
): Promise<ImapFlow> {
  const server = await resolveMailServer(settings.host, settings.port, {
    allowedPorts: ALLOWED_IMAP_PORTS,
    allowPrivate: options.allowPrivateHosts,
  });
  const client = new ImapFlow({
    // Connect to the vetted IP; servername keeps TLS SNI and certificate
    // verification bound to the hostname the user entered.
    host: server.address,
    servername: server.hostname,
    port: server.port,
    secure: settings.secure,
    auth: { user: settings.username, pass: settings.password },
    logger: false,
    disableAutoIdle: true,
    connectionTimeout: options.timeoutMs ?? IMAP_TIMEOUTS.CONNECTION,
    greetingTimeout: options.timeoutMs ?? IMAP_TIMEOUTS.GREETING,
    socketTimeout: IMAP_TIMEOUTS.SOCKET,
  });
  await client.connect();
  return client;
}

/** Opens a session, runs `work`, and always tears the connection down. */
export async function withImapSession<T>(
  settings: ImapServerSettings,
  options: ImapSessionOptions,
  work: (client: ImapFlow) => Promise<T>,
): Promise<T> {
  const client = await openImapSession(settings, options);
  try {
    return await work(client);
  } finally {
    await client.logout().catch(() => client.close());
  }
}

function lastSegment(mailbox: ListResponse): string {
  return mailbox.name.toLowerCase();
}

function findMailbox(
  mailboxes: ListResponse[],
  specialUse: string,
  fallbackNames: readonly string[],
): string | null {
  const bySpecialUse = mailboxes.find(
    (mailbox) => mailbox.specialUse === specialUse,
  );
  if (bySpecialUse) return bySpecialUse.path;
  const byName = mailboxes.find((mailbox) =>
    fallbackNames.includes(lastSegment(mailbox)),
  );
  return byName?.path ?? null;
}

export function detectSpecialMailboxes(
  mailboxes: ListResponse[],
): SpecialMailboxes {
  return {
    archive: findMailbox(
      mailboxes,
      SPECIAL_USE.ARCHIVE,
      FALLBACK_NAMES.ARCHIVE,
    ),
    sent: findMailbox(mailboxes, SPECIAL_USE.SENT, FALLBACK_NAMES.SENT),
    trash: findMailbox(mailboxes, SPECIAL_USE.TRASH, FALLBACK_NAMES.TRASH),
  };
}

/**
 * Where to create an Archive folder on servers that have none. Servers whose
 * folders all live under INBOX (cPanel/Courier) reject top-level creates.
 */
export function archiveMailboxPathFor(mailboxes: ListResponse[]): string {
  const children = mailboxes.filter(
    (mailbox) => mailbox.path.toUpperCase() !== INBOX_MAILBOX,
  );
  const delimiter = mailboxes[0]?.delimiter || ".";
  const nestsUnderInbox =
    children.length > 0 &&
    children.every((mailbox) =>
      mailbox.path.toUpperCase().startsWith(`${INBOX_MAILBOX}${delimiter}`),
    );
  return nestsUnderInbox
    ? `${INBOX_MAILBOX}${delimiter}${DEFAULT_ARCHIVE_NAME}`
    : DEFAULT_ARCHIVE_NAME;
}
