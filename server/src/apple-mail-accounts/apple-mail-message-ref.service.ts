import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";

import { AppleMailMessageRef } from "../database/entities/apple-mail-message-ref.entity";

export interface AppleMailRef {
  messageId: string;
  appleId: number;
  accountName: string;
}

/**
 * Persistence for the RFC-822 ↔ Mail.app numeric message-id mapping.
 * See AppleMailMessageRef for why the mapping exists.
 */
@Injectable()
export class AppleMailMessageRefService {
  constructor(
    @InjectRepository(AppleMailMessageRef)
    private refRepository: Repository<AppleMailMessageRef>,
  ) {}

  async upsertRefs(userId: string, refs: AppleMailRef[]): Promise<void> {
    if (refs.length === 0) return;
    // Dedupe by messageId within the batch: the same RFC-822 Message-Id can
    // appear across accounts/mailboxes, and Postgres rejects an ON CONFLICT
    // upsert whose value set touches the same (userId, messageId) row twice.
    // Last occurrence wins.
    const byMessageId = new Map<string, AppleMailRef>();
    for (const ref of refs) {
      byMessageId.set(ref.messageId, ref);
    }
    await this.refRepository.upsert(
      [...byMessageId.values()].map((ref) => ({
        userId,
        messageId: ref.messageId,
        appleId: String(ref.appleId),
        accountName: ref.accountName,
      })),
      ["userId", "messageId"],
    );
  }

  async getByAppleIds(
    userId: string,
    appleIds: number[],
  ): Promise<AppleMailRef[]> {
    if (appleIds.length === 0) return [];
    const rows = await this.refRepository.find({
      where: { userId, appleId: In(appleIds.map(String)) },
    });
    return rows.map((row) => this.toRef(row));
  }

  async getByMessageIds(
    userId: string,
    messageIds: string[],
  ): Promise<AppleMailRef[]> {
    if (messageIds.length === 0) return [];
    const rows = await this.refRepository.find({
      where: { userId, messageId: In(messageIds) },
    });
    return rows.map((row) => this.toRef(row));
  }

  /** Returns the subset of appleIds that have no stored mapping yet. */
  async filterUnknownAppleIds(
    userId: string,
    appleIds: number[],
  ): Promise<Set<number>> {
    if (appleIds.length === 0) return new Set();
    const known = await this.getByAppleIds(userId, appleIds);
    const knownSet = new Set(known.map((ref) => ref.appleId));
    return new Set(appleIds.filter((appleId) => !knownSet.has(appleId)));
  }

  private toRef(row: AppleMailMessageRef): AppleMailRef {
    return {
      messageId: row.messageId,
      appleId: Number(row.appleId),
      accountName: row.accountName,
    };
  }
}
