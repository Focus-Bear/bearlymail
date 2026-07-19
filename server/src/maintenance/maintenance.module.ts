import { Module } from "@nestjs/common";

import { QueueModule } from "../queue/queue.module";
import { DataRetentionService } from "./data-retention.service";

/**
 * Cross-cutting maintenance crons (data retention, etc.). Loaded by the worker
 * so its scheduled jobs run there.
 */
@Module({
  imports: [QueueModule],
  providers: [DataRetentionService],
})
export class MaintenanceModule {}
