import { Inject, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { PgBoss } from "pg-boss";
import { In, Repository } from "typeorm";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { QUERY_LIMITS } from "../constants/query-limits";
import { MS_PER_SECOND, SECONDS } from "../constants/time-constants";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { getJobPriority } from "../queue/job-priorities";
import type { FetchUserEmailsJobData } from "./fetch-user-emails-job.types";
import { GmailProvider } from "./providers/gmail.provider";
import { GMAIL_INBOX_QUERY } from "./providers/gmail-inbox-query";
import { GmailSyncService } from "./providers/gmail-sync.service";

/** How many older threads one "process another 500" click imports. */
export const IMPORT_OLDER_BATCH_SIZE = QUERY_LIMITS.INITIAL_SYNC_MAX_EMAILS;

/**
 * Threads listed per click before dropping ones already imported. `before:` matches any
 * message, so long threads we already hold come back too — list extra to still fill a batch.
 */
const IMPORT_OLDER_LIST_LIMIT = IMPORT_OLDER_BATCH_SIZE * 2;

const IMPORT_OLDER_SINGLETON_PREFIX = "import-older-emails-";

export const IMPORT_OLDER_STATUS = {
  QUEUED: "queued",
  NOTHING_OLDER: "nothing-older",
  UNSUPPORTED: "unsupported",
} as const;

export type ImportOlderStatus =
  (typeof IMPORT_OLDER_STATUS)[keyof typeof IMPORT_OLDER_STATUS];

export interface ImportOlderEmailsResult {
  status: ImportOlderStatus;
  queuedThreads: number;
}

/** Gmail search clause selecting mail older than `cursor` (epoch seconds, as Gmail expects). */
export function buildOlderThanQuery(cursor: Date): string {
  return `${GMAIL_INBOX_QUERY} before:${Math.floor(cursor.getTime() / MS_PER_SECOND)}`;
}

/** Listed thread IDs not yet in BearlyMail, newest first, capped at one batch. */
export function pickNewThreadIds(
  listedThreadIds: string[],
  existingThreadIds: ReadonlySet<string>,
): string[] {
  return listedThreadIds
    .filter((threadId) => !existingThreadIds.has(threadId))
    .slice(0, IMPORT_OLDER_BATCH_SIZE);
}

/**
 * Imports the next batch of OLDER inbox mail on request (the triage-cleared
 * "process another 500" notice). The initial sync stops at the
 * INITIAL_SYNC_MAX_EMAILS most recent threads; this lists the threads older
 * than the oldest one we hold and queues them as a backfill continuation job.
 *
 * Gmail only for now — other providers report `unsupported` and the client says so.
 */
@Injectable()
export class ImportOlderEmailsService {
  private readonly logger = new Logger(ImportOlderEmailsService.name);

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
    @InjectRepository(EmailThread)
    private readonly threadRepository: Repository<EmailThread>,
    @InjectRepository(Email)
    private readonly emailRepository: Repository<Email>,
    private readonly gmailProvider: GmailProvider,
    private readonly gmailSyncService: GmailSyncService,
  ) {}

  async importNextBatch(userId: string): Promise<ImportOlderEmailsResult> {
    const gmail = await this.gmailProvider.createGmailClientPublic(userId);
    if (!gmail) {
      return { status: IMPORT_OLDER_STATUS.UNSUPPORTED, queuedThreads: 0 };
    }
    const cursor = await this.findOldestThreadActivity(userId);
    if (!cursor) {
      return { status: IMPORT_OLDER_STATUS.NOTHING_OLDER, queuedThreads: 0 };
    }

    const { threadIds: listed } =
      await this.gmailSyncService.fetchAllThreadsWithPagination(
        gmail,
        buildOlderThanQuery(cursor),
        IMPORT_OLDER_LIST_LIMIT,
      );
    const newThreadIds = pickNewThreadIds(
      listed,
      await this.findExistingThreadIds(userId, listed),
    );
    if (newThreadIds.length === 0) {
      return { status: IMPORT_OLDER_STATUS.NOTHING_OLDER, queuedThreads: 0 };
    }

    const jobData: FetchUserEmailsJobData = {
      userId,
      threadIds: newThreadIds,
      isContinuation: true,
      isBackfill: true,
    };
    await this.boss.send(JOB_NAMES.FETCH_USER_EMAILS, jobData, {
      priority: getJobPriority(JOB_NAMES.FETCH_USER_EMAILS, true),
      // A double click must not queue the same batch twice.
      singletonKey: `${IMPORT_OLDER_SINGLETON_PREFIX}${userId}`,
      singletonSeconds: SECONDS.FIVE_MINUTES,
    });
    this.logger.log(
      `[IMPORT_OLDER] user=${userId} queued ${newThreadIds.length} older threads`,
    );
    return {
      status: IMPORT_OLDER_STATUS.QUEUED,
      queuedThreads: newThreadIds.length,
    };
  }

  /**
   * The latest activity of the stalest thread we hold — Gmail lists threads by latest
   * activity, so every thread the initial sync skipped has activity before this.
   */
  private async findOldestThreadActivity(userId: string): Promise<Date | null> {
    const row = await this.emailRepository
      .createQueryBuilder("email")
      .select('MAX(email."receivedAt")', "latest")
      .where('email."userId" = :userId', { userId })
      .groupBy('email."emailThreadId"')
      .orderBy("latest", "ASC")
      .limit(1)
      .getRawOne<{ latest: Date | string | null }>();
    return row?.latest ? new Date(row.latest) : null;
  }

  private async findExistingThreadIds(
    userId: string,
    threadIds: string[],
  ): Promise<Set<string>> {
    if (threadIds.length === 0) {
      return new Set();
    }
    const existing = await this.threadRepository.find({
      where: { userId, threadId: In(threadIds) },
      select: { threadId: true },
    });
    return new Set(existing.map((thread) => thread.threadId));
  }
}
