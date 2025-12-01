import { Injectable, Inject, Logger } from '@nestjs/common';
import PgBoss = require('pg-boss');
import { UsersService } from '../users/users.service';

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    @Inject('PG_BOSS') private readonly boss: PgBoss,
    private readonly usersService: UsersService,
  ) {}

  async startHistoricalScan(userId: string): Promise<{ message: string }> {
    const user = await this.usersService.findOne(userId);
    if (!user) {
      throw new Error('User not found');
    }
    if (!user.googleCalendarAccessToken) {
      throw new Error('Google account not connected. Please connect your Google account first.');
    }

    this.logger.log(`Queueing historical email scan for user ${userId}`);
    await this.boss.send('scan-history', { userId });
    return { message: 'Historical email scan initiated in the background.' };
  }

  async getScanProgress(userId: string): Promise<{ progress: { current: number; total: number } | null }> {
    const user = await this.usersService.findOne(userId);
    if (!user) {
      return { progress: null };
    }

    if (user.scanProgress !== null && user.scanTotal !== null) {
      return {
        progress: {
          current: user.scanProgress,
          total: user.scanTotal,
        },
      };
    }

    return { progress: null };
  }
}

