import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { BatchSchedule } from "../database/entities/batch-schedule.entity";
import { BlockedKeyword } from "../database/entities/blocked-keyword.entity";
import { BlockedSender } from "../database/entities/blocked-sender.entity";
import { CategoryRule } from "../database/entities/category-rule.entity";
import { DeletedAccount } from "../database/entities/deleted-account.entity";
import { SummarizationRule } from "../database/entities/summarization-rule.entity";
import { User } from "../database/entities/user.entity";
import { UserContext } from "../database/entities/user-context.entity";
import { AccountDeletionProcessor } from "./account-deletion.processor";
import { DataExportService } from "./data-export.service";
import { DataImportService } from "./data-import.service";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      UserContext,
      BatchSchedule,
      BlockedSender,
      BlockedKeyword,
      SummarizationRule,
      DeletedAccount,
      CategoryRule,
    ]),
  ],
  providers: [
    UsersService,
    DataExportService,
    DataImportService,
    AccountDeletionProcessor,
  ],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
