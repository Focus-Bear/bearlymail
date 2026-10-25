import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { Organization } from "../database/entities/organization.entity";
import { LLMModule } from "../llm/llm.module";
import { QueueModule } from "../queue/queue.module";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { BusinessMetricsProcessor } from "./business-metrics.processor";
import { CostSnapshotService } from "./cost-snapshot.service";
import { SubscriberSnapshotService } from "./subscriber-snapshot.service";

/**
 * Daily company-level PostHog snapshots (subscribers, MRR, running costs).
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
    CostSnapshotService,
  ],
})
export class BusinessMetricsModule {}
