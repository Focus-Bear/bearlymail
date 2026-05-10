import { Global, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuditLog } from "../database/entities/audit-log.entity";
import { QueueModule } from "../queue/queue.module";
import { AuditService } from "./audit.service";
import { AuditArchiveProcessor } from "./audit-archive.processor";

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog]), ConfigModule, QueueModule],
  providers: [AuditService, AuditArchiveProcessor],
  exports: [AuditService],
})
export class AuditModule {}
