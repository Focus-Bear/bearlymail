import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { MILLISECONDS } from "../constants/time-constants";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { EmailProviderManager } from "../emails/email-provider-manager.service";
import type { EmailProvider } from "../emails/interfaces/email-provider.interface";
import { UserEncryptionService } from "../encryption/user-encryption.service";
import { getErrorMessage } from "../types/common";
import { UsersService } from "../users/users.service";

/** Snoozed threads restored at once: enough to be quick, few enough to stay under Gmail's per-user rate limit. */
const RELEASE_CONCURRENCY = 5;
/** Account deletion waits on this, so it is capped; threads not reached in time are reported as still snoozed. */
const RELEASE_TIME_BUDGET_SECONDS = 20;
const RELEASE_TIME_BUDGET_MS =
  RELEASE_TIME_BUDGET_SECONDS * MILLISECONDS.SECOND;

export interface SnoozeReleaseResult {
  released: number;
  stillSnoozed: number;
}

/**
 * Puts every snoozed thread of a user back in their provider's inbox before
 * the account is deleted. Snoozing removes a thread from the Gmail inbox
 * (INBOX off, SnoozedBearlyMail on) and only the snooze cron puts it back; once
 * the account and its tokens are gone nothing would, so the mail would stay out
 * of the inbox for good.
 */
@Injectable()
export class SnoozeReleaseService implements OnModuleInit {
  private readonly logger = new Logger(SnoozeReleaseService.name);

  constructor(
    @InjectRepository(EmailThread)
    private readonly emailThreadRepository: Repository<EmailThread>,
    @InjectRepository(Email)
    private readonly emailRepository: Repository<Email>,
    @Inject(forwardRef(() => EmailProviderManager))
    private readonly emailProviderManager: EmailProviderManager,
    private readonly userEncryptionService: UserEncryptionService,
    private readonly usersService: UsersService,
  ) {}

  onModuleInit(): void {
    this.usersService.beforeAccountDeletion.register(async (userId) => {
      const { stillSnoozed } = await this.releaseAllSnoozedThreads(userId);
      return { stillSnoozedThreads: stillSnoozed };
    });
  }

  /** Never throws: a thread that can't be restored is counted as still snoozed. */
  async releaseAllSnoozedThreads(userId: string): Promise<SnoozeReleaseResult> {
    // Plaintext columns only: hydrating the whole entity would decrypt
    // per-user-encrypted columns this doesn't need (see SnoozeProcessor).
    const threads = await this.emailThreadRepository.find({
      where: { userId, isSnoozed: true },
      select: { id: true, threadId: true },
    });
    if (threads.length === 0) {
      return { released: 0, stillSnoozed: 0 };
    }

    const threadIds = threads.map((thread) => thread.threadId);
    let released = 0;
    try {
      // Reading the provider's OAuth tokens needs the user's key, as in the snooze worker.
      released = await this.userEncryptionService.withUserKey(
        userId,
        async () => {
          const provider =
            await this.emailProviderManager.getPrimaryProvider(userId);
          return provider ? this.unsnoozeAll(userId, provider, threadIds) : 0;
        },
      );
    } catch (error) {
      this.logger.warn(
        `[SnoozeRelease] Could not restore snoozed threads for user ${userId}: ${getErrorMessage(error)}`,
      );
    }

    const stillSnoozed = threadIds.length - released;
    this.logger.log(
      `[SnoozeRelease] user ${userId}: restored ${released} snoozed thread(s), ${stillSnoozed} still snoozed`,
    );
    return { released, stillSnoozed };
  }

  private async unsnoozeAll(
    userId: string,
    provider: EmailProvider,
    threadIds: string[],
  ): Promise<number> {
    const deadline = Date.now() + RELEASE_TIME_BUDGET_MS;
    let nextIndex = 0;
    let released = 0;
    const worker = async () => {
      while (nextIndex < threadIds.length && Date.now() < deadline) {
        const threadId = threadIds[nextIndex++];
        if (await this.unsnoozeOne(userId, provider, threadId)) {
          released++;
        }
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.min(RELEASE_CONCURRENCY, threadIds.length) },
        worker,
      ),
    );
    return released;
  }

  private async unsnoozeOne(
    userId: string,
    provider: EmailProvider,
    threadId: string,
  ): Promise<boolean> {
    try {
      await provider.unsnoozeThread(userId, threadId);
      await this.emailThreadRepository.update(
        { userId, threadId },
        { isSnoozed: false, snoozeUntil: null },
      );
      await this.emailRepository.update(
        { userId, threadId },
        { isSnoozed: false, snoozeUntil: null },
      );
      return true;
    } catch (error) {
      this.logger.warn(
        `[SnoozeRelease] Could not restore snoozed thread ${threadId} for user ${userId}: ${getErrorMessage(error)}`,
      );
      return false;
    }
  }
}
