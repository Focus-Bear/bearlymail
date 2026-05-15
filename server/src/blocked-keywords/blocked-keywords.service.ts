import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { MILLISECONDS } from "../constants/time-constants";
import { SearchIndexHelper } from "../contacts/search-index.helper";
import { BlockedKeyword } from "../database/entities/blocked-keyword.entity";

export interface BlockedKeywordInfo {
  id: string;
  keyword: string;
  exactMatch: boolean;
  reason?: string;
  blockedAt: Date;
}

@Injectable()
export class BlockedKeywordsService {
  // Cache of blocked keywords per user for fast lookups
  private blockedCache = new Map<string, BlockedKeyword[]>();
  private cacheExpiry = new Map<string, number>();
  // 5 minutes
  private readonly CACHE_TTL = 5 * MILLISECONDS.MINUTE;

  constructor(
    @InjectRepository(BlockedKeyword)
    private blockedKeywordRepository: Repository<BlockedKeyword>,
  ) {}

  /**
   * Block a keyword
   */
  async blockKeyword(
    userId: string,
    keyword: string,
    exactMatch: boolean = false,
    reason?: string,
  ): Promise<BlockedKeyword> {
    // Normalize keyword to lowercase for consistent matching
    const normalizedKeyword = keyword.toLowerCase().trim();
    const keywordHash = SearchIndexHelper.hashExact(normalizedKeyword);

    // Check if already blocked
    const existing = await this.blockedKeywordRepository.findOne({
      where: { userId, keywordHash },
    });

    if (existing) {
      // Update existing block
      existing.reason = reason;
      existing.exactMatch = exactMatch;
      await this.blockedKeywordRepository.save(existing);
      this.invalidateCache(userId);
      return existing;
    }

    // Create new block
    const blocked = this.blockedKeywordRepository.create({
      userId,
      keyword: normalizedKeyword,
      keywordHash,
      exactMatch,
      reason,
    });

    await this.blockedKeywordRepository.save(blocked);
    this.invalidateCache(userId);
    return blocked;
  }

  /**
   * Unblock a keyword by ID
   */
  async unblockKeyword(
    userId: string,
    blockedKeywordId: string,
  ): Promise<void> {
    await this.blockedKeywordRepository.delete({
      id: blockedKeywordId,
      userId,
    });
    this.invalidateCache(userId);
  }

  /**
   * Unblock by keyword text
   */
  async unblockByKeyword(userId: string, keyword: string): Promise<void> {
    const normalizedKeyword = keyword.toLowerCase().trim();
    const keywordHash = SearchIndexHelper.hashExact(normalizedKeyword);
    await this.blockedKeywordRepository.delete({ userId, keywordHash });
    this.invalidateCache(userId);
  }

  /**
   * Get all blocked keywords for a user
   */
  async getBlockedKeywords(userId: string): Promise<BlockedKeywordInfo[]> {
    const blocked = await this.blockedKeywordRepository.find({
      where: { userId },
      order: { blockedAt: "DESC" },
    });

    return blocked.map((itemB) => ({
      id: itemB.id,
      keyword: itemB.keyword,
      exactMatch: itemB.exactMatch,
      reason: itemB.reason,
      blockedAt: itemB.blockedAt,
    }));
  }

  /**
   * Check if a subject line contains any blocked keywords
   * Returns the matched keyword if found, null otherwise
   */
  async checkSubjectForBlockedKeywords(
    userId: string,
    subject: string,
  ): Promise<BlockedKeyword | null> {
    await this.ensureCache(userId);

    const blockedKeywords = this.blockedCache.get(userId) || [];
    const normalizedSubject = subject.toLowerCase();

    for (const blocked of blockedKeywords) {
      if (blocked.exactMatch) {
        // Exact phrase match - check if the keyword appears as a complete phrase
        // Use word boundaries to match exact phrases
        // nosemgrep
        const regex = new RegExp(
          `\\b${this.escapeRegex(blocked.keyword)}\\b`,
          "i",
        );
        if (regex.test(normalizedSubject)) {
          return blocked;
        }
      } else {
        // Partial match - check if keyword appears anywhere in subject
        if (normalizedSubject.includes(blocked.keyword)) {
          return blocked;
        }
      }
    }

    return null;
  }

  /**
   * Check multiple subjects at once (batch check)
   * Returns array of { id, matchedKeyword } for subjects that match
   */
  async filterBlockedSubjects(
    userId: string,
    emails: { id: string; subject: string }[],
  ): Promise<{ id: string; matchedKeyword: string }[]> {
    await this.ensureCache(userId);

    const blockedKeywords = this.blockedCache.get(userId) || [];
    const blockedResults: { id: string; matchedKeyword: string }[] = [];

    for (const email of emails) {
      const normalizedSubject = email.subject.toLowerCase();

      for (const blocked of blockedKeywords) {
        let isMatch = false;

        if (blocked.exactMatch) {
          const regex = new RegExp(
            `\\b${this.escapeRegex(blocked.keyword)}\\b`,
            "i",
          );
          isMatch = regex.test(normalizedSubject);
        } else {
          isMatch = normalizedSubject.includes(blocked.keyword);
        }

        if (isMatch) {
          blockedResults.push({
            id: email.id,
            matchedKeyword: blocked.keyword,
          });
          // Only need to find one match per email
          break;
        }
      }
    }

    return blockedResults;
  }

  private escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  private async ensureCache(userId: string): Promise<void> {
    const expiry = this.cacheExpiry.get(userId);
    if (expiry && Date.now() < expiry) {
      // Cache is still valid
      return;
    }

    // Refresh cache
    const blocked = await this.blockedKeywordRepository.find({
      where: { userId },
    });

    this.blockedCache.set(userId, blocked);
    this.cacheExpiry.set(userId, Date.now() + this.CACHE_TTL);
  }

  private invalidateCache(userId: string): void {
    this.blockedCache.delete(userId);
    this.cacheExpiry.delete(userId);
  }
}
