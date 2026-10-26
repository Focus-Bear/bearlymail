import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { Organization } from "../database/entities/organization.entity";
import { LLMModule } from "../llm/llm.module";
import { QueueModule } from "../queue/queue.module";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { AiCostSnapshotService } from "./ai-cost-snapshot.service";
import { BusinessMetricsProcessor } from "./business-metrics.processor";
import { SubscriberSnapshotService } from "./subscriber-snapshot.service";

/**
 * Daily company-level PostHog snapshots (subscribers, MRR, AI cost).
 * Loaded by the worker so the cron runs there.
 */
@Module({
  imports: [
    QueueModule,
    TypeOrmModule.forFeature([Organization]),
    LLMModule,
    SubscriptionsModule,
  ],
  providers: [
    BusinessMetricsProcessor,
    SubscriberSnapshotService,
    AiCostSnapshotService,
  ],
})
export class BusinessMetricsModule {}
