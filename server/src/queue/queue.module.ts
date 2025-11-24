import { Module, Global, OnApplicationBootstrap, OnModuleDestroy, Inject } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import PgBoss = require('pg-boss');

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'PG_BOSS',
      useFactory: async (configService: ConfigService) => {
        const dbHost = configService.get<string>('DB_HOST');
        const isLocal = dbHost === 'localhost' || dbHost === '127.0.0.1';
        const sslEnabled = configService.get<string>('DB_SSL') === 'true';
        const useSsl = (!isLocal || sslEnabled) ? { rejectUnauthorized: false } : false;

        const boss = new PgBoss({
          connectionString: `postgres://${configService.get('DB_USERNAME')}:${configService.get('DB_PASSWORD')}@${configService.get('DB_HOST')}:${configService.get('DB_PORT')}/${configService.get('DB_NAME')}`,
          ssl: useSsl,
        });
        await boss.start();
        return boss;
      },
      inject: [ConfigService],
    },
  ],
  exports: ['PG_BOSS'],
})
export class QueueModule implements OnApplicationBootstrap, OnModuleDestroy {
  constructor(@Inject('PG_BOSS') private boss: PgBoss) {}

  async onApplicationBootstrap() {
    // Boss started in useFactory
  }

  async onModuleDestroy() {
    await this.boss.stop();
  }
}

export const InjectBoss = () => Inject('PG_BOSS');
