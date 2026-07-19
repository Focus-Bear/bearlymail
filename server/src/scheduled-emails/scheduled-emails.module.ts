import {
  forwardRef,
  Inject,
  Logger,
  Module,
  OnModuleInit,
} from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import type { PgBoss } from "pg-boss";

import { AppleMailAccountsModule } from "../apple-mail-accounts/apple-mail-accounts.module";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { ContactsModule } from "../contacts/contacts.module";
import { ScheduledEmail } from "../database/entities/scheduled-email.entity";
import { EmailsModule } from "../emails/emails.module";
import { GoogleAccountsModule } from "../google-accounts/google-accounts.module";
import { Office365AccountsModule } from "../office365-accounts/office365-accounts.module";
import { registerWorker } from "../queue/register-worker";
import { UsersModule } from "../users/users.module";
import { ZohoAccountsModule } from "../zoho-accounts/zoho-accounts.module";
import { ScheduledEmailsController } from "./scheduled-emails.controller";
import { ScheduledEmailsService } from "./scheduled-emails.service";
import { SendScheduledEmailsProcessor } from "./send-scheduled-emails.processor";

@Module({
  imports: [
    TypeOrmModule.forFeature([ScheduledEmail]),
    forwardRef(() => EmailsModule),
    ContactsModule,
    UsersModule,
    GoogleAccountsModule,
    Office365AccountsModule,
    ZohoAccountsModule,
    forwardRef(() => AppleMailAccountsModule),
  ],
  controllers: [ScheduledEmailsController],
  providers: [ScheduledEmailsService, SendScheduledEmailsProcessor],
  exports: [ScheduledEmailsService],
})
export class ScheduledEmailsModule implements OnModuleInit {
  private readonly logger = new Logger(ScheduledEmailsModule.name);

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
    private readonly sendScheduledEmailsProcessor: SendScheduledEmailsProcessor,
  ) {}

  async onModuleInit() {
    // Register cron job to check for scheduled emails every 5 minutes
    await this.boss.schedule(
      JOB_NAMES.SEND_SCHEDULED_EMAILS,
      // Every 5 minutes
      "*/5 * * * *",
      {},
      {
        tz: "UTC",
      },
    );

    // Register job processor
    await registerWorker(
      this.boss,
      JOB_NAMES.SEND_SCHEDULED_EMAILS,
      async () => {
        await this.sendScheduledEmailsProcessor.process();
      },
    );

    this.logger.log("Scheduled emails cron job registered (every 5 minutes)");
  }
}
