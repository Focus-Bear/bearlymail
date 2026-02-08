import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UsersService } from "./users.service";
import { UsersController } from "./users.controller";
import { DataExportService } from "./data-export.service";
import { DataImportService } from "./data-import.service";
import { User } from "../database/entities/user.entity";
import { UserContext } from "../database/entities/user-context.entity";
import { BatchSchedule } from "../database/entities/batch-schedule.entity";
import { BlockedSender } from "../database/entities/blocked-sender.entity";
import { BlockedKeyword } from "../database/entities/blocked-keyword.entity";
import { SummarizationRule } from "../database/entities/summarization-rule.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      UserContext,
      BatchSchedule,
      BlockedSender,
      BlockedKeyword,
      SummarizationRule,
    ]),
  ],
  providers: [UsersService, DataExportService, DataImportService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
