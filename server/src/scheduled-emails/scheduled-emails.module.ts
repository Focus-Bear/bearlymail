import { Module, forwardRef, OnModuleInit, Inject, Logger } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ScheduledEmailsController } from "./scheduled-emails.controller";
import { ScheduledEmailsService } from "./scheduled-emails.service";
import { SendScheduledEmailsProcessor } from "./send-scheduled-emails.processor";
import { ScheduledEmail } from "../database/entities/scheduled-email.entity";
import { EmailsModule } from "../emails/emails.module";
import { ContactsModule } from "../contacts/contacts.module";
import { UsersModule } from "../users/users.module";
import PgBoss = require("pg-boss");

@Module({
  imports: [
    TypeOrmModule.forFeature([ScheduledEmail]),
    forwardRef(() => EmailsModule),
    ContactsModule,
    UsersModule,
  ],
  controllers: [ScheduledEmailsController],
  providers: [ScheduledEmailsService, SendScheduledEmailsProcessor],
  exports: [ScheduledEmailsService],
})
export class ScheduledEmailsModule implements OnModuleInit {
  private readonly logger = new Logger(ScheduledEmailsModule.name);

  constructor(
    @Inject("PG_BOSS") private readonly boss: PgBoss,
    private readonly sendScheduledEmailsProcessor: SendScheduledEmailsProcessor,
  ) {}

  async onModuleInit() {
    // Register cron job to check for scheduled emails every 5 minutes
    await this.boss.schedule(
      "send-scheduled-emails",
      "*/5 * * * *", // Every 5 minutes
      {},
      {
        tz: "UTC",
      },
    );

    // Register job processor
    await this.boss.work("send-scheduled-emails", async () => {
      await this.sendScheduledEmailsProcessor.process();
    });

    this.logger.log("Scheduled emails cron job registered (every 5 minutes)");
  }
}
