import type { FetchMessageObject, ImapFlow, SearchObject } from "imapflow";
import { simpleParser } from "mailparser";

import { IMAP_MAX_FULL_SOURCE_BYTES } from "../../../constants/mail-server.constants";
import { INBOX_MAILBOX } from "../../../imap-accounts/imap-session";
import { RawEmailMessage } from "../../interfaces/email-provider.interface";
import { normalizeMessageId } from "../rfc822/rfc822-threading";
import { parseImapMessage } from "./imap-message-parser";

const SEEN_FLAG = "\\Seen";
export const FLAGGED_FLAG = "\\Flagged";
/**
 * Messages above this are parsed from headers only: one huge attachment
 * shouldn't be pulled into worker memory just to list it in the inbox.
 */
const MAX_FULL_SOURCE_BYTES = IMAP_MAX_FULL_SOURCE_BYTES;

export interface InboxSnapshotEntry {
  uid: number;
  messageId: string;
  isRead: boolean;
  isFlagged: boolean;
  internalDate?: Date;
  size?: number;
}

export interface InboxSnapshot {
  entries: InboxSnapshotEntry[];
  /** More matching mail exists than `limit` allowed us to list. */
  hitLimit: boolean;
}

/**
 * Some messages (often automated mail) have no Message-ID header; give them a
 * stable synthetic one so they can be stored and deduplicated across syncs.
 */
export function fallbackMessageId(
  uidValidity: bigint | number | undefined,
  uid: number,
  host: string,
): string {
  return `imap.${String(uidValidity ?? 0)}.${uid}@${host}`;
}

async function withMailbox<T>(
  client: ImapFlow,
  mailbox: string,
  work: () => Promise<T>,
): Promise<T> {
  const lock = await client.getMailboxLock(mailbox);
  try {
    return await work();
  } finally {
    lock.release();
  }
}

async function searchUids(
  client: ImapFlow,
  criteria: SearchObject,
): Promise<number[]> {
  const uids = await client.search(criteria, { uid: true });
  return Array.isArray(uids) ? uids : [];
}

function uidValidityOf(client: ImapFlow): bigint | number | undefined {
  return client.mailbox ? client.mailbox.uidValidity : undefined;
}

function toSnapshotEntry(
  message: FetchMessageObject,
  uidValidity: bigint | number | undefined,
  host: string,
): InboxSnapshotEntry {
  const flags = message.flags ?? new Set<string>();
  return {
    uid: message.uid,
    messageId: normalizeMessageId(
      message.envelope?.messageId ||
        fallbackMessageId(uidValidity, message.uid, host),
    ),
    isRead: flags.has(SEEN_FLAG),
    isFlagged: flags.has(FLAGGED_FLAG),
    internalDate: message.internalDate
      ? new Date(message.internalDate)
      : undefined,
    size: message.size,
  };
}

const SNAPSHOT_FIELDS = {
  uid: true,
  envelope: true,
  flags: true,
  internalDate: true,
  size: true,
} as const;

/** Envelope + flags for `uids` of the selected mailbox; no bodies. */
async function fetchSnapshotEntries(
  client: ImapFlow,
  uids: number[],
  host: string,
): Promise<InboxSnapshotEntry[]> {
  if (uids.length === 0) return [];
  const uidValidity = uidValidityOf(client);
  const messages = await client.fetchAll(uids, SNAPSHOT_FIELDS, { uid: true });
  return messages.map((message) => toSnapshotEntry(message, uidValidity, host));
}

/** The newest `limit` inbox messages received since `since`, cheaply. */
export async function listInboxSnapshot(
  client: ImapFlow,
  options: { since: Date; limit: number; host: string },
): Promise<InboxSnapshot> {
  return withMailbox(client, INBOX_MAILBOX, async () => {
    const uids = await searchUids(client, { since: options.since });
    const newest = uids
      .sort((left, right) => right - left)
      .slice(0, options.limit);
    return {
      entries: await fetchSnapshotEntries(client, newest, options.host),
      hitLimit: uids.length > options.limit,
    };
  });
}

/** Keeps IMAP SEARCH command lines well under typical server limits. */
const MESSAGE_ID_SEARCH_CHUNK = 50;

function messageIdCriteria(messageId: string): SearchObject {
  return { header: { "message-id": `<${normalizeMessageId(messageId)}>` } };
}

/**
 * Which of `messageIds` are still in `mailbox`. One OR-search per chunk, so
 * checking a batch of threads costs a handful of round trips, not one each.
 */
export async function findMessageIdsPresent(
  client: ImapFlow,
  options: { mailbox: string; messageIds: string[]; host: string },
): Promise<Set<string>> {
  const wanted = new Set(options.messageIds.map(normalizeMessageId));
  const present = new Set<string>();
  await withMailbox(client, options.mailbox, async () => {
    const ids = [...wanted];
    for (let i = 0; i < ids.length; i += MESSAGE_ID_SEARCH_CHUNK) {
      const chunk = ids.slice(i, i + MESSAGE_ID_SEARCH_CHUNK);
      const criteria =
        chunk.length === 1
          ? messageIdCriteria(chunk[0])
          : { or: chunk.map(messageIdCriteria) };
      const uids = await searchUids(client, criteria);
      const entries = await fetchSnapshotEntries(client, uids, options.host);
      for (const entry of entries) {
        if (wanted.has(entry.messageId)) present.add(entry.messageId);
      }
    }
  });
  return present;
}

async function parseFetched(
  message: FetchMessageObject,
  entry: InboxSnapshotEntry,
): Promise<RawEmailMessage | null> {
  const source = message.source ?? message.headers;
  if (!source) return null;
  const parsed = await simpleParser(source);
  return parseImapMessage(
    parsed,
    {
      isRead: entry.isRead,
      isFlagged: entry.isFlagged,
      internalDate: entry.internalDate,
    },
    entry.messageId,
  );
}

/** Downloads and parses the given snapshot entries from `mailbox`. */
export async function fetchMessages(
  client: ImapFlow,
  mailbox: string,
  entries: InboxSnapshotEntry[],
): Promise<RawEmailMessage[]> {
  if (entries.length === 0) return [];
  const byUid = new Map(entries.map((entry) => [entry.uid, entry]));
  const fullUids = entries
    .filter((entry) => (entry.size ?? 0) <= MAX_FULL_SOURCE_BYTES)
    .map((entry) => entry.uid);
  const headerOnlyUids = entries
    .filter((entry) => (entry.size ?? 0) > MAX_FULL_SOURCE_BYTES)
    .map((entry) => entry.uid);

  const fetched = await withMailbox(client, mailbox, async () => [
    ...(fullUids.length
      ? await client.fetchAll(
          fullUids,
          { uid: true, source: true },
          { uid: true },
        )
      : []),
    ...(headerOnlyUids.length
      ? await client.fetchAll(
          headerOnlyUids,
          { uid: true, headers: true },
          { uid: true },
        )
      : []),
  ]);

  const parsed = await Promise.all(
    fetched.map((message) => {
      const entry = byUid.get(message.uid);
      return entry ? parseFetched(message, entry) : null;
    }),
  );
  return parsed.filter((raw): raw is RawEmailMessage => raw !== null);
}

/** UIDs in the currently selected mailbox carrying any of `messageIds`. */
async function findUidsByMessageIds(
  client: ImapFlow,
  messageIds: string[],
): Promise<number[]> {
  const uids: number[] = [];
  for (const messageId of messageIds) {
    uids.push(...(await searchUids(client, messageIdCriteria(messageId))));
  }
  return uids;
}

/**
 * Moves a thread's messages out of each source mailbox. IMAP UIDs change when
 * a message moves, so messages are always located by Message-ID.
 */
export async function moveMessages(
  client: ImapFlow,
  options: { messageIds: string[]; sources: string[]; destination: string },
): Promise<number> {
  let moved = 0;
  for (const source of options.sources) {
    if (source === options.destination) continue;
    moved += await withMailbox(client, source, async () => {
      const uids = await findUidsByMessageIds(client, options.messageIds);
      if (uids.length === 0) return 0;
      await client.messageMove(uids, options.destination, { uid: true });
      return uids.length;
    });
  }
  return moved;
}

export async function setMessageFlag(
  client: ImapFlow,
  options: {
    messageIds: string[];
    mailboxes: string[];
    flag: string;
    enabled: boolean;
  },
): Promise<void> {
  for (const mailbox of options.mailboxes) {
    await withMailbox(client, mailbox, async () => {
      const uids = await findUidsByMessageIds(client, options.messageIds);
      if (uids.length === 0) return;
      if (options.enabled) {
        await client.messageFlagsAdd(uids, [options.flag], { uid: true });
      } else {
        await client.messageFlagsRemove(uids, [options.flag], { uid: true });
      }
    });
  }
}

/** Raw RFC-822 source of the first copy found across `mailboxes`. */
export async function downloadMessageSource(
  client: ImapFlow,
  options: { messageId: string; mailboxes: string[] },
): Promise<Buffer | null> {
  for (const mailbox of options.mailboxes) {
    const source = await withMailbox(client, mailbox, async () => {
      const [uid] = await findUidsByMessageIds(client, [options.messageId]);
      if (!uid) return null;
      const message = await client.fetchOne(
        String(uid),
        { source: true },
        { uid: true },
      );
      return message ? (message.source ?? null) : null;
    });
    if (source) return source;
  }
  return null;
}

/** Stores a copy of a sent message, marked read like any client's Sent copy. */
export async function appendSentMessage(
  client: ImapFlow,
  mailbox: string,
  raw: Buffer,
): Promise<void> {
  await client.append(mailbox, raw, [SEEN_FLAG]);
}

/** Newest-first UIDs of `mailbox` matching `criteria`, capped at `limit`. */
export async function searchMailbox(
  client: ImapFlow,
  options: {
    mailbox: string;
    criteria: SearchObject;
    limit: number;
    host: string;
  },
): Promise<RawEmailMessage[]> {
  const entries = await withMailbox(client, options.mailbox, async () => {
    const uids = await searchUids(client, options.criteria);
    const newest = uids
      .sort((left, right) => right - left)
      .slice(0, options.limit);
    return fetchSnapshotEntries(client, newest, options.host);
  });
  return fetchMessages(client, options.mailbox, entries);
}
