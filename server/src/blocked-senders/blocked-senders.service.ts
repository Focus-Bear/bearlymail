import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { MILLISECONDS } from "../constants/time-constants";
import { SearchIndexHelper } from "../contacts/search-index.helper";
import { BlockedSender } from "../database/entities/blocked-sender.entity";

export interface BlockedSenderInfo {
  id: string;
  email: string;
  senderName?: string;
  reason?: string;
  blockedAt: Date;
}

@Injectable()
export class BlockedSendersService {
  // Cache of blocked email hashes per user for fast lookups
  private blockedCache = new Map<string, Set<string>>();
  private blockedDomainCache = new Map<string, Set<string>>();
  private cacheExpiry = new Map<string, number>();
  // 5 minutes
  private readonly CACHE_TTL = 5 * MILLISECONDS.MINUTE;

  constructor(
    @InjectRepository(BlockedSender)
    private blockedSenderRepository: Repository<BlockedSender>,
  ) {}

  /**
   * Block a sender
   */
  async blockSender(
    userId: string,
    email: string,
    senderName?: string,
    reason?: string,
    blockDomain: boolean = false,
  ): Promise<BlockedSender> {
    const emailHash = SearchIndexHelper.hashExact(email);
    const domain = email.split("@")[1];
    const domainHash =
      blockDomain && domain ? SearchIndexHelper.hashExact(domain) : null;

    // Check if already blocked
    const existing = await this.blockedSenderRepository.findOne({
      where: { userId, emailHash },
    });

    if (existing) {
      // Update existing block
      existing.reason = reason;
      existing.senderName = senderName;
      if (domainHash) existing.domainHash = domainHash;
      await this.blockedSenderRepository.save(existing);
      this.invalidateCache(userId);
      return existing;
    }

    // Create new block
    const blocked = this.blockedSenderRepository.create({
      userId,
      email,
      emailHash,
      domainHash,
      senderName,
      reason,
    });

    await this.blockedSenderRepository.save(blocked);
    this.invalidateCache(userId);
    return blocked;
  }

  /**
   * Unblock a sender
   */
  async unblockSender(userId: string, blockedSenderId: string): Promise<void> {
    await this.blockedSenderRepository.delete({ id: blockedSenderId, userId });
    this.invalidateCache(userId);
  }

  /**
   * Unblock by email address
   */
  async unblockByEmail(userId: string, email: string): Promise<void> {
    const emailHash = SearchIndexHelper.hashExact(email);
    await this.blockedSenderRepository.delete({ userId, emailHash });
    this.invalidateCache(userId);
  }

  /**
   * Get all blocked senders for a user
   */
  async getBlockedSenders(userId: string): Promise<BlockedSenderInfo[]> {
    const blocked = await this.blockedSenderRepository.find({
      where: { userId },
      order: { blockedAt: "DESC" },
    });

    return blocked.map((itemB) => ({
      id: itemB.id,
      email: itemB.email,
      senderName: itemB.senderName,
      reason: itemB.reason,
      blockedAt: itemB.blockedAt,
    }));
  }

  /**
   * Check if a sender is blocked (fast, uses cache)
   */
  async isSenderBlocked(userId: string, email: string): Promise<boolean> {
    await this.ensureCache(userId);

    if (!email) {
      return false;
    }

    const emailHash = SearchIndexHelper.hashExact(email);
    const blockedEmails = this.blockedCache.get(userId);

    if (blockedEmails?.has(emailHash)) {
      return true;
    }

    // Check domain blocking
    const domain = email.split("@")[1];
    if (domain) {
      const domainHash = SearchIndexHelper.hashExact(domain);
      const blockedDomains = this.blockedDomainCache.get(userId);
      if (blockedDomains?.has(domainHash)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get all blocked email hashes for a user (for filtering queries)
   */
  async getBlockedEmailHashes(userId: string): Promise<string[]> {
    await this.ensureCache(userId);
    const blockedEmails = this.blockedCache.get(userId);
    return blockedEmails ? Array.from(blockedEmails) : [];
  }

  /**
   * Check multiple emails at once (batch check)
   */
  async filterBlockedEmails(
    userId: string,
    emails: { id: string; from: string }[],
  ): Promise<string[]> {
    await this.ensureCache(userId);

    const blockedEmails = this.blockedCache.get(userId) || new Set();
    const blockedDomains = this.blockedDomainCache.get(userId) || new Set();

    const blockedIds: string[] = [];

    for (const email of emails) {
      const from = email.from ?? "";
      if (!from) {
        continue;
      }

      const emailHash = SearchIndexHelper.hashExact(from);
      if (blockedEmails.has(emailHash)) {
        blockedIds.push(email.id);
        continue;
      }

      const domain = from.split("@")[1];
      if (domain) {
        const domainHash = SearchIndexHelper.hashExact(domain);
        if (blockedDomains.has(domainHash)) {
          blockedIds.push(email.id);
        }
      }
    }

    return blockedIds;
  }

  private async ensureCache(userId: string): Promise<void> {
    const expiry = this.cacheExpiry.get(userId);
    if (expiry && Date.now() < expiry) {
      // Cache is still valid
      return;
    }

    // Refresh cache
    const blocked = await this.blockedSenderRepository.find({
      where: { userId },
      select: {
        emailHash: true,
        domainHash: true,
      },
    });

    const emailHashes = new Set<string>();
    const domainHashes = new Set<string>();

    for (const itemB of blocked) {
      emailHashes.add(itemB.emailHash);
      if (itemB.domainHash) {
        domainHashes.add(itemB.domainHash);
      }
    }

    this.blockedCache.set(userId, emailHashes);
    this.blockedDomainCache.set(userId, domainHashes);
    this.cacheExpiry.set(userId, Date.now() + this.CACHE_TTL);
  }

  private invalidateCache(userId: string): void {
    this.blockedCache.delete(userId);
    this.blockedDomainCache.delete(userId);
    this.cacheExpiry.delete(userId);
  }
}
