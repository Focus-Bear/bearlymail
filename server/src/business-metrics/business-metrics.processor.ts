import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import type { PgBoss } from "pg-boss";

import {
  BUSINESS_ANALYTICS_EVENTS,
  SYSTEM_DISTINCT_IDS,
} from "../constants/analytics-events";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { MILLISECONDS } from "../constants/time-constants";
import { ErrorTrackingService } from "../error-tracking/error-tracking.service";
import { registerWorker } from "../queue/register-worker";
import {
  BUSINESS_METRICS_SNAPSHOT_CRON,
  utcDateOf,
} from "./business-metrics.constants";
import { CostSnapshotService } from "./cost-snapshot.service";
import { SubscriberSnapshotService } from "./subscriber-snapshot.service";

/** Start (00:00 UTC) of the UTC day before `now`. */
export function previousUtcDayStart(now: Date): Date {
  const todayStart = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return new Date(todayStart - MILLISECONDS.DAY);
}

/**
 * Daily cron that sends company-level metrics to PostHog under system
 * distinct IDs, so they stay out of per-user analytics: subscriber counts by
 * tier and MRR, and (behind COST_SNAPSHOT_ENABLED) the cost to run.
 */
@Injectable()
export class BusinessMetricsProcessor implements OnModuleInit {
  private readonly logger = new Logger(BusinessMetricsProcessor.name);

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
    private readonly subscriberSnapshot: SubscriberSnapshotService,
    private readonly costSnapshot: CostSnapshotService,
    private readonly errorTracking: ErrorTrackingService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.boss.schedule(
        JOB_NAMES.BUSINESS_METRICS_SNAPSHOT,
        BUSINESS_METRICS_SNAPSHOT_CRON,
      );
      await registerWorker(
        this.boss,
        JOB_NAMES.BUSINESS_METRICS_SNAPSHOT,
        async () => {
          await this.sendSnapshots(new Date());
        },
      );
      this.logger.log("Business-metrics snapshot registered (daily)");
    } catch (err) {
      // Scheduling failure must not crash module init.
      this.logger.error("Failed to register business-metrics snapshot", err);
    }
  }

  /**
   * Sends the snapshots for the UTC day before `now`. Each runs on its own so
   * one failure doesn't lose the other, then any failure fails the job.
   */
  async sendSnapshots(now: Date): Promise<void> {
    const dayStart = previousUtcDayStart(now);
    const failures: string[] = [];
    try {
      await this.sendSubscriberSnapshot(dayStart);
    } catch (err) {
      this.logger.error("Subscriber snapshot failed", err);
      failures.push(BUSINESS_ANALYTICS_EVENTS.SUBSCRIBER_SNAPSHOT);
    }
    try {
      await this.sendCostSnapshot(dayStart);
    } catch (err) {
      this.logger.error("Cost snapshot failed", err);
      failures.push(BUSINESS_ANALYTICS_EVENTS.COST_SNAPSHOT);
    }
    if (failures.length > 0) {
      throw new Error(
        `Business-metrics snapshots failed: ${failures.join(", ")}`,
      );
    }
  }

  private async sendSubscriberSnapshot(dayStart: Date): Promise<void> {
    const properties = await this.subscriberSnapshot.buildSnapshot(
      utcDateOf(dayStart),
    );
    this.errorTracking.captureSystemEvent(
      BUSINESS_ANALYTICS_EVENTS.SUBSCRIBER_SNAPSHOT,
      SYSTEM_DISTINCT_IDS.SUBSCRIPTIONS,
      properties,
    );
  }

  private async sendCostSnapshot(dayStart: Date): Promise<void> {
    if (!this.costSnapshot.enabled()) return;
    const properties = await this.costSnapshot.buildSnapshot(dayStart);
    this.errorTracking.captureSystemEvent(
      BUSINESS_ANALYTICS_EVENTS.COST_SNAPSHOT,
      SYSTEM_DISTINCT_IDS.COSTS,
      properties,
    );
  }
}
