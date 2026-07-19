import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { LessThan, Repository } from "typeorm";

import { DebugConfig } from "../database/entities/debug-config.entity";
import { DebugData } from "../database/entities/debug-data.entity";
import { DEBUG_FEATURES } from "./debug-feature-names";

/** A content hash seen more than once across recent LLM calls. */
export interface DuplicateLlmCall {
  contentHash: string;
  count: number;
  callSites: string[];
  operations: string[];
}

/** Simple in-memory cache entry for feature-enabled lookups. */
interface CacheEntry {
  enabled: boolean;
  expiresAt: number;
}

/** TTL for the isEnabled() in-memory cache (60 seconds). */
const CACHE_TTL_MS = 60_000;

/** Milliseconds in one day — used for retention cutoff calculations. */
const MS_PER_DAY = 86_400_000;

@Injectable()
export class DebugService {
  private readonly logger = new Logger(DebugService.name);
  private readonly enabledCache = new Map<string, CacheEntry>();

  constructor(
    @InjectRepository(DebugData)
    private readonly debugDataRepo: Repository<DebugData>,
    @InjectRepository(DebugConfig)
    private readonly debugConfigRepo: Repository<DebugConfig>,
  ) {}

  /**
   * Check if a debug feature is enabled.
   * Result is cached in-memory for CACHE_TTL_MS (60 seconds) to keep the hot
   * path cheap when debugging is disabled.
   *
   * NOTE: This cache is instance-local. In a multi-pod deployment, cache
   * invalidation (e.g. via setEnabled) only takes effect on the pod that
   * handled the request. Other pods will continue serving the old cached value
   * for up to CACHE_TTL_MS ms before they re-read from the database.
   */
  async isEnabled(feature: string): Promise<boolean> {
    const now = Date.now();
    const cached = this.enabledCache.get(feature);
    if (cached && cached.expiresAt > now) {
      return cached.enabled;
    }

    const config = await this.debugConfigRepo.findOne({ where: { feature } });
    const enabled = config?.enabled ?? false;
    this.enabledCache.set(feature, { enabled, expiresAt: now + CACHE_TTL_MS });
    return enabled;
  }

  /**
   * Log a debug event for the given feature.
   * No-op (and near-zero overhead) if the feature is disabled.
   */
  async log(
    feature: string,
    userId: string | null,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const enabled = await this.isEnabled(feature);
    if (!enabled) return;

    try {
      const entry = this.debugDataRepo.create({ feature, userId, payload });
      await this.debugDataRepo.save(entry);
    } catch (err) {
      // Never let debug logging crash the caller
      this.logger.warn(
        `Failed to write debug_data for feature=${feature}`,
        err,
      );
    }
  }

  /**
   * Find prompt-content hashes that recur across recent LLM calls (the
   * llm_call_fingerprint feature). Each row is a hash seen >1×, with the
   * distinct call sites and operations that produced it — i.e. the redundant
   * LLM calls. Returns [] when the feature has never been enabled.
   */
  async findDuplicateLlmCalls(
    sinceDays = 14,
    limit = 200,
  ): Promise<DuplicateLlmCall[]> {
    const cutoff = new Date(Date.now() - sinceDays * MS_PER_DAY);
    return this.debugDataRepo.query(
      `SELECT payload->>'contentHash' AS "contentHash",
              COUNT(*)::int AS "count",
              jsonb_agg(DISTINCT payload->>'callSite') AS "callSites",
              jsonb_agg(DISTINCT payload->>'operation') AS "operations"
       FROM debug_data
       WHERE feature = $1 AND "createdAt" > $2 AND payload ? 'contentHash'
       GROUP BY payload->>'contentHash'
       HAVING COUNT(*) > 1
       ORDER BY COUNT(*) DESC
       LIMIT $3`,
      [DEBUG_FEATURES.LLM_CALL_FINGERPRINT, cutoff, limit],
    );
  }

  /**
   * Batch-log multiple debug events for the same feature in a single INSERT.
   * No-op if the feature is disabled. Prefer this over looping `log()` calls
   * when instrumenting a batch operation to avoid N serial round-trips.
   */
  async logBatch(
    feature: string,
    userId: string | null,
    dataItems: Record<string, unknown>[],
  ): Promise<void> {
    if (dataItems.length === 0) return;
    const enabled = await this.isEnabled(feature);
    if (!enabled) return;

    try {
      const entries = dataItems.map((item) =>
        this.debugDataRepo.create({ feature, userId, payload: item }),
      );
      await this.debugDataRepo.save(entries);
    } catch (err) {
      // Never let debug logging crash the caller
      this.logger.warn(
        `Failed to batch-write ${dataItems.length} debug_data rows for feature=${feature}`,
        err,
      );
    }
  }

  /** Get all debug feature configs (for admin UI). */
  async getAllConfigs(): Promise<DebugConfig[]> {
    return this.debugConfigRepo.find({ order: { feature: "ASC" } });
  }

  /**
   * Update enabled flag and/or retentionDays for a debug feature in a single
   * DB round-trip.
   *
   * Cache notes:
   * - If `enabled` is provided, the in-memory isEnabled() cache is invalidated
   *   immediately on this pod (other pods will lag up to CACHE_TTL_MS).
   * - `retentionDays` does NOT affect the enabled cache, so no invalidation is
   *   needed for that field alone.
   */
  async updateDebugConfig(
    feature: string,
    updates: { enabled?: boolean; retentionDays?: number },
  ): Promise<void> {
    const patch: Partial<Pick<DebugConfig, "enabled" | "retentionDays">> = {};
    if (updates.enabled !== undefined) patch.enabled = updates.enabled;
    if (updates.retentionDays !== undefined)
      patch.retentionDays = updates.retentionDays;

    if (Object.keys(patch).length === 0) return;

    await this.debugConfigRepo.update({ feature }, patch);

    // Invalidate enabled cache if the enabled flag changed.
    if (updates.enabled !== undefined) {
      this.enabledCache.delete(feature);
    }
  }

  /**
   * Toggle a debug feature on/off.
   * @deprecated Use updateDebugConfig() for combined updates.
   */
  async setEnabled(feature: string, enabled: boolean): Promise<void> {
    await this.updateDebugConfig(feature, { enabled });
  }

  /**
   * Update retentionDays for a debug feature.
   * @deprecated Use updateDebugConfig() for combined updates.
   */
  async setRetentionDays(
    feature: string,
    retentionDays: number,
  ): Promise<void> {
    await this.updateDebugConfig(feature, { retentionDays });
  }

  /**
   * Aggregated redundancy detection summary for a feature.
   * Groups by threadId + emailCount and shows cases where count > 1 in the
   * last 24 hours.
   */
  async getRedundancySummary(feature: string): Promise<unknown[]> {
    return this.debugDataRepo.manager.query(
      `
      SELECT
        payload->>'threadId' AS "threadId",
        (payload->>'emailCount')::int AS "emailCount",
        COUNT(*) AS "analysisCount",
        array_agg(payload->>'caller') AS "callers",
        MIN("createdAt") AS "firstSeen",
        MAX("createdAt") AS "lastSeen"
      FROM debug_data
      WHERE feature = $1
        AND "createdAt" > now() - interval '24 hours'
      GROUP BY payload->>'threadId', (payload->>'emailCount')::int
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
      LIMIT 100
      `,
      [feature],
    );
  }

  /**
   * Delete expired debug data rows based on each feature's retentionDays.
   * Returns total rows deleted.
   */
  async cleanupExpiredData(): Promise<number> {
    const configs = await this.debugConfigRepo.find();
    let totalDeleted = 0;

    for (const config of configs) {
      const cutoff = new Date(Date.now() - config.retentionDays * MS_PER_DAY);
      const result = await this.debugDataRepo.delete({
        feature: config.feature,
        createdAt: LessThan(cutoff),
      });
      const deleted = result.affected ?? 0;
      if (deleted > 0) {
        this.logger.log(
          `Cleaned up ${deleted} debug_data rows for feature=${config.feature} (older than ${config.retentionDays} days)`,
        );
      }
      totalDeleted += deleted;
    }

    return totalDeleted;
  }

  /**
   * Query debug data for a feature with optional pagination and filters.
   */
  async queryData(
    feature: string,
    options: { limit?: number; offset?: number; userId?: string } = {},
  ): Promise<{ rows: DebugData[]; total: number }> {
    const { limit = 50, offset = 0, userId } = options;
    const where: Record<string, unknown> = { feature };
    if (userId) where.userId = userId;

    const [rows, total] = await this.debugDataRepo.findAndCount({
      where,
      order: { createdAt: "DESC" },
      take: limit,
      skip: offset,
    });
    return { rows, total };
  }

  /**
   * Delete all debug data for a specific feature (manual cleanup).
   * Returns the number of deleted rows.
   */
  async deleteFeatureData(feature: string): Promise<number> {
    const result = await this.debugDataRepo.delete({ feature });
    return result.affected ?? 0;
  }
}
