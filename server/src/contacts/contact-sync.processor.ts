import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import PgBoss from "pg-boss";

import { JOB_NAMES } from "../constants/job-names";
import { PusherService } from "../pusher/pusher.service";
import { UsersService } from "../users/users.service";
import { ContactsService } from "./contacts.service";

@Injectable()
export class ContactSyncProcessor implements OnModuleInit {
  private readonly logger = new Logger(ContactSyncProcessor.name);

  constructor(
    @Inject("PG_BOSS") private boss: PgBoss,
    private readonly contactsService: ContactsService,
    private readonly usersService: UsersService,
    private readonly pusherService: PusherService,
  ) {}

  async onModuleInit() {
    await this.boss.schedule(JOB_NAMES.SCHEDULE_CONTACT_SYNC_JOBS, "0 3 * * *");

    await this.boss.work(JOB_NAMES.SCHEDULE_CONTACT_SYNC_JOBS, async () => {
      this.logger.log("Starting daily contact sync scheduling");
      try {
        const users = await this.usersService.findAll();
        let jobsQueued = 0;

        for (const user of users) {
          try {
            if (user.googleCalendarAccessToken) {
              await this.boss.send(
                JOB_NAMES.SYNC_CONTACTS,
                { userId: user.id },
                {
                  singletonKey: `sync-contacts-${user.id}`,
                  singletonMinutes: 60,
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
    });

    await this.boss.work(
      JOB_NAMES.SYNC_CONTACTS,
      { teamSize: 3 } as PgBoss.WorkOptions,
      async (job) => {
        const { userId } = job.data as { userId: string };
        const workerId = job.id || "unknown";

        this.logger.log(
          `[Worker ${workerId}] Starting contact sync for user ${userId}`,
        );

        try {
          await this.pusherService.triggerContactSyncStarted(userId);

          const results = await this.contactsService.syncContacts(userId);

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
