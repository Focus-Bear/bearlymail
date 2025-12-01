import { Module, Global, OnApplicationBootstrap, OnModuleDestroy, Inject, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import PgBoss = require('pg-boss');

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'PG_BOSS',
      useFactory: async (configService: ConfigService) => {
        const logger = new Logger('QueueModule');
        const dbHost = configService.get<string>('DB_HOST');
        const isLocal = dbHost === 'localhost' || dbHost === '127.0.0.1';
        const sslEnabled = configService.get<string>('DB_SSL') === 'true';
        const useSsl = (!isLocal || sslEnabled) ? { rejectUnauthorized: false } : false;

        const boss = new PgBoss({
          connectionString: `postgres://${configService.get('DB_USERNAME')}:${configService.get('DB_PASSWORD')}@${configService.get('DB_HOST')}:${configService.get('DB_PORT')}/${configService.get('DB_NAME')}`,
          ssl: useSsl,
          // Connection retry settings
          retryLimit: 5,
          retryDelay: 5000, // 5 seconds
          retryBackoff: true,
          // Worker settings - handle connection errors gracefully
          noSupervisor: false,
          expireInMinutes: 15, // Jobs expire after 15 minutes if not processed
          deleteAfterHours: 24, // Delete completed jobs after 24 hours
        });

        // Handle connection errors gracefully
        boss.on('error', (error) => {
          logger.error('PgBoss connection error:', error);
          // Don't throw - let pg-boss handle reconnection
        });

        // Handle worker errors - these are logged but don't crash the app
        boss.on('monitor-states', (monitor) => {
          // Monitor is running, connection is healthy
        });

        try {
          await boss.start();
          logger.log('PgBoss started successfully');
          
          // Set up automatic reconnection handling
          boss.on('stopped', () => {
            logger.warn('PgBoss stopped, attempting to restart...');
            boss.start().catch(err => {
              logger.error('Failed to restart PgBoss:', err);
            });
          });
        } catch (error) {
          logger.error('Failed to start PgBoss:', error);
          throw error;
        }

        return boss;
      },
      inject: [ConfigService],
    },
  ],
  exports: ['PG_BOSS'],
})
export class QueueModule implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(QueueModule.name);
  
  constructor(@Inject('PG_BOSS') private boss: PgBoss) {}

  async onApplicationBootstrap() {
    // Boss started in useFactory
    // Set up error handlers
    this.boss.on('error', (error) => {
      this.logger.error('PgBoss error (handled):', error.message);
      // Connection errors are handled by pg-boss automatically with retry
    });
  }

  async onModuleDestroy() {
    try {
      await this.boss.stop();
    } catch (error) {
      this.logger.error('Error stopping PgBoss:', error);
    }
  }
}

export const InjectBoss = () => Inject('PG_BOSS');
