import { Inject, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import PgBoss from "pg-boss";
import { Repository } from "typeorm";

import { EmailThread } from "../database/entities/email-thread.entity";
import { getJobPriority } from "../queue/job-priorities";
import { UsersService } from "../users/users.service";

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    @Inject("PG_BOSS") private readonly boss: PgBoss,
    private readonly usersService: UsersService,
    @InjectRepository(EmailThread)
    private readonly emailThreadRepository: Repository<EmailThread>,
  ) {}

  async startHistoricalScan(userId: string): Promise<{ message: string }> {
    const user = await this.usersService.findOne(userId);
    if (!user) {
      throw new Error("User not found");
    }
    if (!user.googleCalendarAccessToken) {
      throw new Error(
        "Google account not connected. Please connect your Google account first.",
      );
    }

    this.logger.log(`Queueing historical email scan for user ${userId}`);
    await this.boss.send(
      "scan-history",
      { userId },
      {
        priority: getJobPriority("scan-history", false),
      },
    );
    return { message: "Historical email scan initiated in the background." };
  }

  async getScanProgress(
    userId: string,
  ): Promise<{ progress: { current: number; total: number } | null }> {
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

  async getOnboardingStatus(userId: string): Promise<{
    hasCompletedOnboarding: boolean;
    needsTermsAcceptance: boolean;
    needsPrivacyAcceptance: boolean;
  }> {
    return this.usersService.getOnboardingStatus(userId);
  }

  async completeOnboarding(userId: string): Promise<{ success: boolean }> {
    await this.usersService.completeOnboarding(userId);
    return { success: true };
  }

  async getEmailImportProgress(userId: string): Promise<{
    prioritizedCount: number;
    isReady: boolean;
  }> {
    const count = await this.emailThreadRepository.count({
      where: {
        userId,
      },
    });

    return {
      prioritizedCount: count,
      isReady: count >= 100,
    };
  }
}
