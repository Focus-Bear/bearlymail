import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { BatchSchedule } from "../database/entities/batch-schedule.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { BatchScheduleController } from "./batch-schedule.controller";
import { BatchScheduleService } from "./batch-schedule.service";

@Module({
  imports: [TypeOrmModule.forFeature([BatchSchedule, EmailThread])],
  providers: [BatchScheduleService],
  controllers: [BatchScheduleController],
  exports: [BatchScheduleService],
})
export class BatchScheduleModule {}
