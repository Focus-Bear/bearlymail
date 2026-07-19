import { MILLISECONDS } from "../constants/time-constants";

const CACHE_TTL_MINUTES = 5;
const TTL_MS = CACHE_TTL_MINUTES * MILLISECONDS.MINUTE;

interface CacheEntry {
  key: Buffer;
  expiresAt: number;
}

class UserKeyCache {
  private readonly cache = new Map<string, CacheEntry>();

  get(userId: string): Buffer | null {
    const entry = this.cache.get(userId);
    if (!entry || Date.now() > entry.expiresAt) {
      this.cache.delete(userId);
      return null;
    }
    return entry.key;
  }

  set(userId: string, key: Buffer): void {
    this.cache.set(userId, { key, expiresAt: Date.now() + TTL_MS });
  }

  invalidate(userId: string): void {
    this.cache.delete(userId);
  }
}

export const userKeyCache = new UserKeyCache();
