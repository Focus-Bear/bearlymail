import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { BlockedSendersService } from "../../blocked-senders/blocked-senders.service";
import { MILLISECONDS } from "../../constants/time-constants";
import {
  UNSUBSCRIBE,
  UnsubscribeMethod,
} from "../../constants/unsubscribe.constants";
import { Email } from "../../database/entities/email.entity";
import { EncryptionHelper } from "../../encryption/encryption.helper";
import { unsubscribeMethodFromStored } from "./list-unsubscribe.parser";

const DAYS_PER_WEEK = 7;
const PER_WEEK_DECIMALS = 10;

/** One mailing list the user receives, as Settings → Subscriptions lists it. */
export interface MailingList {
  /** The sender's latest email with unsubscribe info; the unsubscribe and archive-sender endpoints act on it. */
  emailId: string;
  name: string | null;
  address: string;
  /** Emails from this sender in the last MAILING_LIST_WINDOW_DAYS. */
  emailCount: number;
  /** The sender's threads still waiting in Triage. */
  triageThreadCount: number;
  lastReceivedAt: string;
  /** Average emails a week since the first one in the window. */
  perWeek: number;
  method: UnsubscribeMethod;
}

interface MailingListRow {
  emailId: string;
  from: string | null;
  fromName: string | null;
  unsubscribeOptions: string | null;
  emailCount: number;
  triageThreadCount: number;
  firstReceivedAt: Date;
  lastReceivedAt: Date;
}

/**
 * Senders that carried unsubscribe info (List-Unsubscribe, or a body link) on
 * at least one email in the window, with their volume. Volume and grouping use
 * only the unencrypted sender HMAC and timestamps; just one row per sender
 * (its latest email with unsubscribe info) is decrypted, in memory.
 */
const MAILING_LISTS_SQL = `
  WITH sender_mail AS (
    SELECT e.id, e."senderEmailHmac", e."receivedAt", e."emailThreadId",
           e."unsubscribeOptions", e."from", e."fromName",
           t."isArchived", t."starCount"
    FROM emails e
    LEFT JOIN email_threads t ON t.id = e."emailThreadId" AND t."userId" = $1
    WHERE e."userId" = $1
      AND e."senderEmailHmac" IS NOT NULL
      AND e."receivedAt" >= $2
  ),
  lists AS (
    SELECT DISTINCT ON ("senderEmailHmac")
           "senderEmailHmac", id AS "emailId", "from", "fromName", "unsubscribeOptions"
    FROM sender_mail
    WHERE "unsubscribeOptions" IS NOT NULL
    ORDER BY "senderEmailHmac", "receivedAt" DESC
  )
  SELECT l."emailId", l."from", l."fromName", l."unsubscribeOptions",
         COUNT(m.id)::int AS "emailCount",
         COUNT(DISTINCT m."emailThreadId")
           FILTER (WHERE m."isArchived" = false AND m."starCount" = 0)::int AS "triageThreadCount",
         MIN(m."receivedAt") AS "firstReceivedAt",
         MAX(m."receivedAt") AS "lastReceivedAt"
  FROM lists l
  JOIN sender_mail m ON m."senderEmailHmac" = l."senderEmailHmac"
  GROUP BY l."senderEmailHmac", l."emailId", l."from", l."fromName", l."unsubscribeOptions"
  ORDER BY "emailCount" DESC, "lastReceivedAt" DESC
  LIMIT $3`;

/** The address inside a `From` value ("Name <a@b.c>" or "a@b.c"), lower-cased. */
export function senderAddressOf(from: string): string {
  const bracketed = from.match(/<([^<>]+)>/);
  return (bracketed ? bracketed[1] : from).trim().toLowerCase();
}

function decryptJson(encrypted: string | null): unknown {
  if (!encrypted) return null;
  try {
    const decrypted = EncryptionHelper.tryDecrypt(
      encrypted,
      "emails.unsubscribeOptions",
    );
    return decrypted ? JSON.parse(decrypted) : null;
  } catch {
    return null;
  }
}

/** Average emails a week, from the first one in the window until now. */
export function emailsPerWeek(
  emailCount: number,
  firstReceivedAt: Date,
  now: Date,
): number {
  const weeks = Math.max(
    1,
    (now.getTime() - firstReceivedAt.getTime()) /
      (DAYS_PER_WEEK * MILLISECONDS.DAY),
  );
  return (
    Math.round((emailCount / weeks) * PER_WEEK_DECIMALS) / PER_WEEK_DECIMALS
  );
}

/**
 * The mailing lists behind Settings → Subscriptions, so the user can
 * unsubscribe from many at once. Senders already blocked are left out: their
 * mail is archived as it arrives, so there is nothing left to clean up.
 */
@Injectable()
export class MailingListsService {
  constructor(
    @InjectRepository(Email)
    private readonly emailRepository: Repository<Email>,
    private readonly blockedSendersService: BlockedSendersService,
  ) {}

  async listMailingLists(
    userId: string,
    now = new Date(),
  ): Promise<MailingList[]> {
    const windowStart = new Date(
      now.getTime() - UNSUBSCRIBE.MAILING_LIST_WINDOW_DAYS * MILLISECONDS.DAY,
    );
    const [rows, blocked] = await Promise.all([
      this.emailRepository.query(MAILING_LISTS_SQL, [
        userId,
        windowStart,
        UNSUBSCRIBE.MAX_MAILING_LISTS,
      ]) as Promise<MailingListRow[]>,
      this.blockedSendersService.getBlockedSenders(userId),
    ]);
    const blockedAddresses = new Set(
      blocked.map((sender) => senderAddressOf(sender.email)),
    );

    return rows.flatMap((row) => {
      const from = EncryptionHelper.tryDecrypt(row.from, "emails.from");
      const method = unsubscribeMethodFromStored(
        decryptJson(row.unsubscribeOptions),
      );
      if (!from || !method) return [];
      const address = senderAddressOf(from);
      if (blockedAddresses.has(address)) return [];
      return [
        {
          emailId: row.emailId,
          name:
            EncryptionHelper.tryDecrypt(row.fromName, "emails.fromName") ||
            null,
          address,
          emailCount: row.emailCount,
          triageThreadCount: row.triageThreadCount,
          lastReceivedAt: new Date(row.lastReceivedAt).toISOString(),
          perWeek: emailsPerWeek(
            row.emailCount,
            new Date(row.firstReceivedAt),
            now,
          ),
          method,
        },
      ];
    });
  }
}
