import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";

import { AUTO_ARCHIVE_PROPOSAL_CONFIG } from "../constants/auto-archive-proposal.constants";
import { GMAIL_LABELS } from "../constants/email-labels";
import { Email } from "../database/entities/email.entity";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { resolveNotificationSubtype } from "../utils/notification-subtype.util";
import { WORKFLOW_MAX_BODY_CHARS } from "../workflows/workflow-condition-matcher";
import { AnalysedEmail } from "./auto-archive-proposals.types";
import { classifyEngagement, EngagementSignals } from "./engagement.helper";
import { sampleEvenly } from "./even-sample.helper";
import {
  planSenderGroups,
  SenderGroupPlan,
  SenderIdentity,
  SenderVolume,
  toSenderIdentity,
} from "./sender-groups.helper";

const IN_CLAUSE_CHUNK = 500;
const EPOCH = new Date(0);

interface VolumeRow {
  senderKey: string;
  total: string;
  newSinceScan: string;
}

interface IdentityRow {
  senderEmailHmac: string;
  from: string | null;
  fromName: string | null;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }
  return chunks;
}

/**
 * Reads what the auto-archive miner needs from one user's mailbox. Volume and
 * grouping run on unencrypted columns (sender HMACs, timestamps); only the
 * emails of heavy senders are loaded and decrypted, and only in memory.
 * Callers must run inside `UserEncryptionService.withUserKey(userId, …)`.
 */
@Injectable()
export class AutoArchiveMailboxLoader {
  constructor(
    @InjectRepository(Email)
    private readonly emailRepository: Repository<Email>,
  ) {}

  /** Heavy sender groups in the window, with how much mail each got since `since`. */
  async findSenderGroups(
    userId: string,
    windowStart: Date,
    since: Date | null,
  ): Promise<SenderGroupPlan[]> {
    const volumes = await this.senderVolumes(userId, windowStart, since);
    if (volumes.length === 0) return [];
    const identities = await this.senderIdentities(
      userId,
      volumes.map((volume) => volume.senderKey),
    );
    return planSenderGroups(volumes, identities);
  }

  private async senderVolumes(
    userId: string,
    windowStart: Date,
    since: Date | null,
  ): Promise<SenderVolume[]> {
    const rows = await this.emailRepository
      .createQueryBuilder("email")
      .select('email."senderEmailHmac"', "senderKey")
      .addSelect("COUNT(*)", "total")
      .addSelect(
        'COUNT(*) FILTER (WHERE email."receivedAt" > :since)',
        "newSinceScan",
      )
      .where('email."userId" = :userId', { userId })
      .andWhere('email."receivedAt" >= :windowStart', { windowStart })
      .andWhere('email."senderEmailHmac" IS NOT NULL')
      .setParameter("since", since ?? EPOCH)
      .groupBy('email."senderEmailHmac"')
      .having("COUNT(*) >= :minimum", {
        minimum: AUTO_ARCHIVE_PROPOSAL_CONFIG.MIN_DOMAIN_MEMBER_VOLUME,
      })
      .getRawMany<VolumeRow>();
    return rows.map((row) => ({
      senderKey: row.senderKey,
      total: Number(row.total),
      newSinceScan: Number(row.newSinceScan),
    }));
  }

  /** One decrypted `from` per sender HMAC (its most recent email). */
  private async senderIdentities(
    userId: string,
    senderKeys: string[],
  ): Promise<SenderIdentity[]> {
    const identities: SenderIdentity[] = [];
    for (const keys of chunk(senderKeys, IN_CLAUSE_CHUNK)) {
      const rows: IdentityRow[] = await this.emailRepository.query(
        `SELECT DISTINCT ON ("senderEmailHmac") "senderEmailHmac", "from", "fromName"
           FROM emails
          WHERE "userId" = $1 AND "senderEmailHmac" = ANY($2)
          ORDER BY "senderEmailHmac", "receivedAt" DESC`,
        [userId, keys],
      );
      for (const row of rows) {
        const identity = toSenderIdentity(
          row.senderEmailHmac,
          EncryptionHelper.tryDecrypt(row.from, "emails.from"),
          EncryptionHelper.tryDecrypt(row.fromName, "emails.fromName"),
        );
        if (identity) identities.push(identity);
      }
    }
    return identities;
  }

  /**
   * A sender group's received emails in the window (sampled evenly when there
   * are more than MAX_EMAILS_PER_SENDER), oldest first, with engagement
   * signals resolved. Threads hidden by a blocked sender/keyword are excluded
   * — those senders are already handled.
   */
  async loadGroupEmails(
    userId: string,
    memberSenderKeys: string[],
    windowStart: Date,
  ): Promise<AnalysedEmail[]> {
    if (memberSenderKeys.length === 0) return [];
    const sampledIds = await this.sampleGroupEmailIds(
      userId,
      memberSenderKeys,
      windowStart,
    );
    if (sampledIds.length === 0) return [];
    const emails = await this.emailRepository
      .createQueryBuilder("email")
      .leftJoin("email.thread", "thread")
      .select([
        "email.id",
        "email.emailThreadId",
        "email.from",
        "email.subject",
        "email.body",
        "email.receivedAt",
        "email.isRead",
        "email.openedAt",
        "email.archivedAt",
        "email.archivedWhileUnread",
        "email.userPriorityOverride",
        "thread.id",
        "thread.starCount",
        "thread.firstStarredAt",
        "thread.archivedByWorkflow",
        "thread.hasBlockedLabel",
      ])
      .where("email.userId = :userId", { userId })
      .andWhere("email.id IN (:...ids)", { ids: sampledIds })
      .orderBy("email.receivedAt", "ASC")
      .getMany();
    const visible = emails.filter((email) => !email.thread?.hasBlockedLabel);
    const lastSentAt = await this.lastSentAtByThread(userId, visible);
    return visible.map((email) => this.toAnalysedEmail(email, lastSentAt));
  }

  /** Ids only (unencrypted, cheap), so sampling never decrypts the whole window. */
  private async sampleGroupEmailIds(
    userId: string,
    memberSenderKeys: string[],
    windowStart: Date,
  ): Promise<string[]> {
    const rows = await this.emailRepository
      .createQueryBuilder("email")
      .select("email.id", "id")
      .where("email.userId = :userId", { userId })
      .andWhere("email.senderEmailHmac IN (:...keys)", {
        keys: memberSenderKeys,
      })
      .andWhere("email.receivedAt >= :windowStart", { windowStart })
      .orderBy("email.receivedAt", "ASC")
      .getRawMany<{ id: string }>();
    return sampleEvenly(
      rows.map((row) => row.id),
      AUTO_ARCHIVE_PROPOSAL_CONFIG.MAX_EMAILS_PER_SENDER,
    );
  }

  /** Latest message the user sent in each thread (replies carry the SENT label). */
  private async lastSentAtByThread(
    userId: string,
    emails: Email[],
  ): Promise<Map<string, Date>> {
    const threadIds = [
      ...new Set(emails.map((email) => email.emailThreadId).filter(Boolean)),
    ];
    const lastSent = new Map<string, Date>();
    for (const ids of chunk(threadIds, IN_CLAUSE_CHUNK)) {
      const threadEmails = await this.emailRepository.find({
        where: { userId, emailThreadId: In(ids) },
        select: { emailThreadId: true, receivedAt: true, labels: true },
      });
      for (const threadEmail of threadEmails) {
        if (!threadEmail.labels?.includes(GMAIL_LABELS.SENT)) continue;
        const previous = lastSent.get(threadEmail.emailThreadId);
        if (!previous || threadEmail.receivedAt > previous) {
          lastSent.set(threadEmail.emailThreadId, threadEmail.receivedAt);
        }
      }
    }
    return lastSent;
  }

  private toAnalysedEmail(
    email: Email,
    lastSentAt: Map<string, Date>,
  ): AnalysedEmail {
    const sentAt = lastSentAt.get(email.emailThreadId);
    const signals: EngagementSignals = {
      receivedAt: email.receivedAt,
      isRead: email.isRead,
      openedAt: email.openedAt,
      archivedAt: email.archivedAt,
      archivedWhileUnread: email.archivedWhileUnread,
      archivedByWorkflow: email.thread?.archivedByWorkflow ?? false,
      replied: sentAt !== undefined && sentAt > email.receivedAt,
      starred:
        (email.thread?.starCount ?? 0) > 0 ||
        Boolean(email.thread?.firstStarredAt),
      userPriorityOverride: email.userPriorityOverride ?? null,
    };
    return {
      id: email.id,
      from: email.from ?? "",
      subject: email.subject ?? "",
      body: (email.body ?? "").slice(0, WORKFLOW_MAX_BODY_CHARS),
      receivedAt: email.receivedAt,
      signals,
      level: classifyEngagement(signals),
      notificationSubtype: resolveNotificationSubtype({
        from: email.from ?? "",
        subject: email.subject ?? "",
        body: email.body,
      }),
    };
  }
}
