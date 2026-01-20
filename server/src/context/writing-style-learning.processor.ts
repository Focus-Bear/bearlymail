import { Injectable, OnModuleInit, Logger, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import PgBoss = require("pg-boss");
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, MoreThan } from "typeorm";
import { Email } from "../database/entities/email.entity";
import { UsersService } from "../users/users.service";
import { WritingStyleLearningService } from "./writing-style-learning.service";
import { getJobPriority } from "../queue/job-priorities";
import { JobPerformanceTracker } from "../queue/job-performance-tracker";

// Check for learning opportunities every 30 minutes
const LEARNING_CHECK_CRON = "*/30 * * * *";

@Injectable()
export class WritingStyleLearningProcessor implements OnModuleInit {
  private readonly logger = new Logger(WritingStyleLearningProcessor.name);

  constructor(
    @Inject("PG_BOSS") private boss: PgBoss,
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    private usersService: UsersService,
    private writingStyleLearningService: WritingStyleLearningService,
    private configService: ConfigService,
  ) {}

  async onModuleInit() {
    // Schedule periodic check for writing style learning
    await this.boss.schedule(
      "check-writing-style-learning",
      LEARNING_CHECK_CRON,
    );

    // Worker for checking and triggering writing style learning
    await this.boss.work(
      "check-writing-style-learning",
      async (job) => {
        const workerId = job.id || "unknown";
        const tracker = new JobPerformanceTracker(
          "check-writing-style-learning",
          workerId,
        );

        this.logger.log(
          `[Worker ${workerId}] Starting writing style learning check`,
        );

        try {
          tracker.startPhase("fetchUsers");
          const users = await this.usersService.findAll();
          tracker.endPhase("fetchUsers");

          let usersProcessed = 0;
          let usersSkipped = 0;

          for (const user of users) {
            try {
              // Check if user needs more examples
              const exampleCount =
                await this.writingStyleLearningService.getExampleCount(user.id);

              if (exampleCount >= 20) {
                usersSkipped++;
                continue;
              }

              // Find recent sent emails (last 7 days) for this user
              // Emails with SENT label are sent by the user
              const sevenDaysAgo = new Date();
              sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

              const recentSentEmails = await this.emailRepository
                .createQueryBuilder("email")
                .where("email.userId = :userId", { userId: user.id })
                .andWhere("email.receivedAt > :since", { since: sevenDaysAgo })
                .andWhere("email.labelIds LIKE :sentLabel", {
                  sentLabel: "%SENT%",
                })
                .orderBy("email.receivedAt", "DESC")
                .take(10)
                .getMany();

              if (recentSentEmails.length > 0) {
                const sentEmailIds = recentSentEmails.map((e) => e.id);
                await this.writingStyleLearningService.learnFromNewSentEmails(
                  user.id,
                  sentEmailIds,
                );
                usersProcessed++;
              } else {
                usersSkipped++;
              }
            } catch (userError) {
              this.logger.error(
                `Error processing writing style learning for user ${user.id}:`,
                userError,
              );
            }
          }

          tracker.finish();
          this.logger.log(
            `[Worker ${workerId}] Writing style learning check complete. Processed: ${usersProcessed}, Skipped: ${usersSkipped}`,
          );
        } catch (error) {
          this.logger.error(
            `[Worker ${workerId}] Writing style learning check failed:`,
            error,
          );
          tracker.finish(error as Error);
          throw error;
        }
      },
    );

    this.logger.log("Writing style learning processor registered");
  }
}
