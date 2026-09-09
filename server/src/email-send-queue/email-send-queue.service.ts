import { Inject, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { PgBoss } from "pg-boss";
import { LessThan, Repository } from "typeorm";

import {
  EMAIL_SEND_RETRY_DELAY_SECONDS,
  EMAIL_SEND_RETRY_LIMIT,
  EMAIL_SEND_STATUS,
  EMAIL_SEND_TYPE,
  EmailSendFailureReason,
  MAX_EMAIL_SEND_ATTEMPTS,
  SEND_SWEEP_BATCH_SIZE,
} from "../constants/email-send.constants";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import {
  EmailSendAttempt,
  QueuedNewEmailPayload,
  QueuedReplyPayload,
} from "../database/entities/email-send-attempt.entity";
import { getJobPriority } from "../queue/job-priorities";

/** Job payload for {@link JOB_NAMES.SEND_QUEUED_EMAIL}. */
export interface SendQueuedEmailJobData {
  userId: string;
  /** Correlation id — the `email_send_attempts` row holding the real payload. */
  sendId: string;
}

/** What a send endpoint hands back to the client instead of a delivery result. */
export interface QueuedSendResult {
  sendId: string;
  status: typeof EMAIL_SEND_STATUS.QUEUED;
}

/**
 * Persists outbound messages and hands them to the worker.
 *
 * Send endpoints call this and return immediately; the provider round-trip (and
 * everything downstream of it) happens in {@link JOB_NAMES.SEND_QUEUED_EMAIL}.
 * The row is written *before* the job is enqueued so a crash in between leaves
 * a recoverable `queued` row for the sweeper rather than a lost message.
 */
@Injectable()
export class EmailSendQueueService {
  private readonly logger = new Logger(EmailSendQueueService.name);

  constructor(
    @InjectRepository(EmailSendAttempt)
    private readonly attemptRepository: Repository<EmailSendAttempt>,
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
  ) {}

  async queueNewEmail(
    userId: string,
    payload: QueuedNewEmailPayload,
  ): Promise<QueuedSendResult> {
    return this.persistAndEnqueue(userId, EMAIL_SEND_TYPE.NEW, null, payload);
  }

  async queueReply(
    userId: string,
    emailId: string,
    payload: QueuedReplyPayload,
  ): Promise<QueuedSendResult> {
    return this.persistAndEnqueue(
      userId,
      EMAIL_SEND_TYPE.REPLY,
      emailId,
      payload,
    );
  }

  /**
   * Atomically moves a `queued` attempt to `sending` and returns it.
   *
   * This conditional update is the double-send guard: only one worker can win
   * the transition, so a retried or duplicated job for an attempt that is
   * already sending, sent or failed gets `null` and does nothing.
   */
  async claimForSending(sendId: string): Promise<EmailSendAttempt | null> {
    const claim = await this.attemptRepository
      .createQueryBuilder()
      .update(EmailSendAttempt)
      .set({
        status: EMAIL_SEND_STATUS.SENDING,
        attempts: () => `"attempts" + 1`,
      })
      .where("id = :sendId AND status = :queued", {
        sendId,
        queued: EMAIL_SEND_STATUS.QUEUED,
      })
      .returning("*")
      .execute();

    // `affected` is not populated by every driver path when RETURNING is used,
    // so fall back to the returned row count before deciding we lost the claim.
    const claimedRows =
      claim.affected ?? (Array.isArray(claim.raw) ? claim.raw.length : 0);
    if (!claimedRows) return null;
    // `returning('*')` bypasses the column transformers, so re-read the entity
    // to get the decrypted payload.
    return this.attemptRepository.findOne({ where: { id: sendId } });
  }

  async markSent(
    sendId: string,
    sent: { messageId: string; threadId: string },
  ): Promise<void> {
    await this.attemptRepository.update(
      { id: sendId },
      {
        status: EMAIL_SEND_STATUS.SENT,
        messageId: sent.messageId,
        threadId: sent.threadId,
        sentAt: new Date(),
      },
    );
  }

  /** Returns the attempt to `queued` so pg-boss can retry it. */
  async releaseForRetry(sendId: string, errorDetail: string): Promise<void> {
    await this.attemptRepository.update(
      { id: sendId },
      { status: EMAIL_SEND_STATUS.QUEUED, errorDetail },
    );
  }

  async markFailed(
    sendId: string,
    failureReason: EmailSendFailureReason,
    errorDetail: string,
  ): Promise<void> {
    await this.attemptRepository.update(
      { id: sendId },
      { status: EMAIL_SEND_STATUS.FAILED, failureReason, errorDetail },
    );
  }

  /** True once the attempt has burned its whole retry budget. */
  hasExhaustedAttempts(attempt: EmailSendAttempt): boolean {
    return attempt.attempts >= MAX_EMAIL_SEND_ATTEMPTS;
  }

  /** `queued` rows whose job never arrived — the sweeper re-enqueues these. */
  findStaleQueued(olderThan: Date): Promise<EmailSendAttempt[]> {
    return this.findStale(EMAIL_SEND_STATUS.QUEUED, olderThan);
  }

  /** `sending` rows whose worker died — delivery is unknown, never re-sent. */
  findStaleSending(olderThan: Date): Promise<EmailSendAttempt[]> {
    return this.findStale(EMAIL_SEND_STATUS.SENDING, olderThan);
  }

  /** Re-enqueues an attempt the sweeper found stranded in `queued`. */
  async requeue(attempt: EmailSendAttempt): Promise<void> {
    await this.enqueueJob(attempt.userId, attempt.id);
    this.logger.warn(`Re-enqueued stranded send attempt ${attempt.id}`);
  }

  private findStale(
    status: EmailSendAttempt["status"],
    olderThan: Date,
  ): Promise<EmailSendAttempt[]> {
    return this.attemptRepository.find({
      where: { status, updatedAt: LessThan(olderThan) },
      order: { updatedAt: "ASC" },
      take: SEND_SWEEP_BATCH_SIZE,
    });
  }

  private async persistAndEnqueue(
    userId: string,
    sendType: EmailSendAttempt["sendType"],
    emailId: string | null,
    payload: EmailSendAttempt["payload"],
  ): Promise<QueuedSendResult> {
    const attempt = await this.attemptRepository.save(
      this.attemptRepository.create({
        userId,
        sendType,
        emailId,
        payload,
        status: EMAIL_SEND_STATUS.QUEUED,
      }),
    );

    await this.enqueueJob(userId, attempt.id);

    return { sendId: attempt.id, status: EMAIL_SEND_STATUS.QUEUED };
  }

  private async enqueueJob(userId: string, sendId: string): Promise<void> {
    const jobData: SendQueuedEmailJobData = { userId, sendId };
    await this.boss.send(JOB_NAMES.SEND_QUEUED_EMAIL, jobData, {
      priority: getJobPriority(JOB_NAMES.SEND_QUEUED_EMAIL, true),
      retryLimit: EMAIL_SEND_RETRY_LIMIT,
      retryDelay: EMAIL_SEND_RETRY_DELAY_SECONDS,
      // One job per attempt row: a duplicate enqueue for the same send is
      // collapsed rather than racing the claim.
      singletonKey: `send-queued-email-${sendId}`,
    });
  }
}
