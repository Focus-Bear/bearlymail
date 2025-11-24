import { Injectable, OnModuleInit, Logger, Inject } from '@nestjs/common';
import PgBoss = require('pg-boss');
import { GmailService } from './gmail.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class EmailSyncProcessor implements OnModuleInit {
  private readonly logger = new Logger(EmailSyncProcessor.name);

  constructor(
    @Inject('PG_BOSS') private boss: PgBoss,
    private readonly gmailService: GmailService,
    private readonly usersService: UsersService,
  ) {}

  async onModuleInit() {
    // Schedule recurring sync for all users every 6 hours
    await this.boss.schedule('sync-all-users', '0 */6 * * *');

    // Worker for syncing all users (triggered by cron)
    await this.boss.work('sync-all-users', async () => {
      this.logger.log('Starting scheduled email sync for all users');
      const users = await this.usersService.findAll();
      for (const user of users) {
        if (user.googleCalendarAccessToken) { // Only sync if connected to Google
          await this.boss.send('sync-gmail', { userId: user.id });
        }
      }
    });

    // Worker for syncing individual user
    await this.boss.work('sync-gmail', async (job) => {
      const { userId } = job.data as { userId: number };
      this.logger.debug(`Starting background email sync for user ${userId}`);
      try {
        await this.gmailService.syncEmails(userId);
        this.logger.debug(`Completed background email sync for user ${userId}`);
      } catch (error) {
        this.logger.error(`Failed to sync emails for user ${userId}`, error);
        throw error;
      }
    });
  }
}
