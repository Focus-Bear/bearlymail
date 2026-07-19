import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import type { PgBoss, WorkOptions } from "pg-boss";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { SECONDS } from "../constants/time-constants";
import { UserEncryptionService } from "../encryption/user-encryption.service";
import { GoogleAccountsService } from "../google-accounts/google-accounts.service";
import { PusherService } from "../pusher/pusher.service";
import { registerWorker } from "../queue/register-worker";
import { UsersService } from "../users/users.service";
import { ContactsService } from "./contacts.service";

@Injectable()
export class ContactSyncProcessor implements OnModuleInit {
  private readonly logger = new Logger(ContactSyncProcessor.name);

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private boss: PgBoss,
    private readonly contactsService: ContactsService,
    private readonly usersService: UsersService,
    private readonly pusherService: PusherService,
    private readonly googleAccountsService: GoogleAccountsService,
    private readonly userEncryptionService: UserEncryptionService,
  ) {}

  async onModuleInit() {
    await this.boss.schedule(JOB_NAMES.SCHEDULE_CONTACT_SYNC_JOBS, "0 3 * * *");

    await registerWorker(
      this.boss,
      JOB_NAMES.SCHEDULE_CONTACT_SYNC_JOBS,
      async () => {
        this.logger.log("Starting daily contact sync scheduling");
        try {
          const users = await this.usersService.findAll();
          let jobsQueued = 0;

          for (const user of users) {
            try {
              /** Check if user should have contact sync based on User entity tokens */
              const hasUserToken = !!user.googleCalendarAccessToken;

              /** Check if user has any active GoogleAccount with a valid token */
              let hasGoogleAccount = false;
              if (!hasUserToken) {
                try {
                  const primary = await this.googleAccountsService.findPrimary(
                    user.id,
                  );
                  hasGoogleAccount = !!primary?.accessToken;
                } catch {
                  hasGoogleAccount = false;
                }
              }

              if (hasUserToken || hasGoogleAccount) {
                await this.boss.send(
                  JOB_NAMES.SYNC_CONTACTS,
                  { userId: user.id },
                  {
                    singletonKey: `sync-contacts-${user.id}`,
                    singletonSeconds: SECONDS.HOUR,
                  },
                );
                jobsQueued++;
              }
            } catch (userError) {
              this.logger.error(
                `Error scheduling contact sync for user ${user.id}:`,
                userError,
              );
            }
          }

          this.logger.log(
            `Scheduled ${jobsQueued} contact sync jobs for daily sync`,
          );
        } catch (error) {
          this.logger.error("Error in schedule-contact-sync-jobs:", error);
          throw error;
        }
      },
    );

    await registerWorker(
      this.boss,
      JOB_NAMES.SYNC_CONTACTS,
      { teamSize: 3 } as WorkOptions,
      async (job) => {
        const { userId } = job.data as { userId: string };
        const workerId = job.id || "unknown";

        this.logger.log(
          `[Worker ${workerId}] Starting contact sync for user ${userId}`,
        );

        try {
          await this.pusherService.triggerContactSyncStarted(userId);

          // syncContacts reads/writes encrypted Contact rows; needs the
          // per-user KMS key in ALS so transformers operate under the
          // same envelope as the HTTP read path.
          const results = await this.userEncryptionService.withUserKey(
            userId,
            () => this.contactsService.syncContacts(userId),
          );

          this.logger.log(
            `[Worker ${workerId}] Completed contact sync for user ${userId}: ${JSON.stringify(results)}`,
          );

          await this.pusherService.triggerContactSyncComplete(userId, results);
        } catch (error) {
          this.logger.error(
            `[Worker ${workerId}] Failed to sync contacts for user ${userId}:`,
            error,
          );
          await this.pusherService.triggerContactSyncFailed(
            userId,
            "Contact sync failed. Please try again.",
          );
          throw error;
        }
      },
    );

    this.logger.log("Contact sync processor initialized");
  }
}
