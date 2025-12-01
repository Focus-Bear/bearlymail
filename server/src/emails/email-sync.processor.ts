import { Injectable, OnModuleInit, Logger, Inject } from '@nestjs/common';
import PgBoss = require('pg-boss');
import { EmailProviderManager } from './email-provider-manager.service';
import { UsersService } from '../users/users.service';
import { GmailProvider } from './providers/gmail.provider';

@Injectable()
export class EmailSyncProcessor implements OnModuleInit {
  private readonly logger = new Logger(EmailSyncProcessor.name);

  constructor(
    @Inject('PG_BOSS') private boss: PgBoss,
    private readonly emailProviderManager: EmailProviderManager,
    private readonly usersService: UsersService,
    private readonly gmailProvider: GmailProvider,
  ) {}

  async onModuleInit() {
    // Schedule recurring sync for all users every 6 hours
    await this.boss.schedule('sync-all-users', '0 */6 * * *');

    // Worker for syncing all users (triggered by cron)
    await this.boss.work('sync-all-users', async () => {
      this.logger.log('Starting scheduled email sync for all users');
      const users = await this.usersService.findAll();
      for (const user of users) {
        const provider = await this.emailProviderManager.getPrimaryProvider(user.id);
        if (provider) {
          await this.boss.send('sync-emails', { userId: user.id });
        }
      }
    });

    // Worker for syncing individual user (generic, works with any provider)
    // Allow up to 3 concurrent email syncs to avoid overwhelming the email provider
    // Add retry on failure - jobs will be retried automatically
    await this.boss.work('sync-emails', { 
      teamSize: 3,
    } as any, async (job) => {
      const { userId } = job.data as { userId: string };
      const workerId = job.id || 'unknown';
      this.logger.log(`[Worker ${workerId}] Starting background email sync for user ${userId}`);
      try {
        await this.emailProviderManager.syncAllProviders(userId);
        this.logger.log(`[Worker ${workerId}] Completed background email sync for user ${userId}`);
      } catch (error) {
        this.logger.error(`[Worker ${workerId}] Failed to sync emails for user ${userId}`, error);
        // Check if it's a connection error - don't retry those, pg-boss will handle reconnection
        if (error && (error.message?.includes('Connection terminated') || error.message?.includes('connection'))) {
          this.logger.warn(`[Worker ${workerId}] Connection error detected, job will be retried after reconnection`);
        }
        throw error; // Re-throw to trigger pg-boss retry mechanism
      }
    });

    // Keep 'sync-gmail' for backwards compatibility, but route to new system
    await this.boss.work('sync-gmail', async (job) => {
      const { userId } = job.data as { userId: string };
      this.logger.debug(`Starting background email sync for user ${userId} (legacy route)`);
      try {
        await this.emailProviderManager.syncAllProviders(userId);
        this.logger.debug(`Completed background email sync for user ${userId}`);
      } catch (error) {
        this.logger.error(`Failed to sync emails for user ${userId}`, error);
        throw error;
      }
    });

    // Worker for historical scan - just queues individual email jobs
    await this.boss.work('scan-history', { teamSize: 2 } as any, async (job) => {
      const { userId } = job.data as { userId: string };
      const workerId = job.id || 'unknown';
      this.logger.log(`[Worker ${workerId}] Starting historical email scan for user ${userId}`);
      try {
        const provider = await this.emailProviderManager.getPrimaryProvider(userId);
        if (provider) {
          await provider.scanHistory(userId);
          this.logger.log(`[Worker ${workerId}] Queued individual email scan jobs for user ${userId}`);
        } else {
          this.logger.warn(`[Worker ${workerId}] No email provider connected for user ${userId}`);
        }
      } catch (error) {
        this.logger.error(`[Worker ${workerId}] Failed to scan history for user ${userId}`, error);
        throw error;
      }
    });

    // Worker for processing individual emails during scan - allow 10 concurrent workers for fast parallel processing
    this.logger.log('Registering scan-history-email worker with teamSize: 10');
    await this.boss.work('scan-history-email', { teamSize: 10 } as any, async (job) => {
      const { userId, messageId } = job.data as { userId: string; messageId: string };
      const workerId = job.id || 'unknown';
      this.logger.log(`[Worker ${workerId}] Processing email ${messageId} for user ${userId}`);
      try {
        if (!this.gmailProvider) {
          this.logger.error(`[Worker ${workerId}] GmailProvider not available`);
          throw new Error('GmailProvider not available');
        }
        await this.gmailProvider.processScanEmail(userId, messageId);
        this.logger.debug(`[Worker ${workerId}] Successfully processed email ${messageId}`);
      } catch (error) {
        this.logger.error(`[Worker ${workerId}] Failed to process email ${messageId} for user ${userId}`, error);
        throw error;
      }
    });
    this.logger.log('scan-history-email worker registered successfully');
  }
}

