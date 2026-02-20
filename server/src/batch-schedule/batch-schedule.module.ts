import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BatchScheduleService } from "./batch-schedule.service";
import { BatchScheduleController } from "./batch-schedule.controller";
import { BatchSchedule } from "../database/entities/batch-schedule.entity";
import { Email } from "../database/entities/email.entity";

@Module({
  imports: [TypeOrmModule.forFeature([BatchSchedule, Email])],
  providers: [BatchScheduleService],
  controllers: [BatchScheduleController],
  exports: [BatchScheduleService],
})
export class BatchScheduleModule {}
