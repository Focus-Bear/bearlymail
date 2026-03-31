import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { DebugConfig } from "../database/entities/debug-config.entity";
import { DebugData } from "../database/entities/debug-data.entity";
import { DebugService } from "./debug.service";
import { DebugCleanupService } from "./debug-cleanup.service";

@Module({
  imports: [TypeOrmModule.forFeature([DebugData, DebugConfig])],
  providers: [DebugService, DebugCleanupService],
  exports: [DebugService],
})
export class DebugModule {}
