import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import type { PgBoss } from "pg-boss";

import {
  EMAIL_SEND_FAILURE_REASON,
  EMAIL_SEND_TYPE,
  EmailSendFailureReason,
  SEND_SWEEP_CRON,
  STALE_QUEUED_MINUTES,
  STALE_SENDING_MINUTES,
} from "../constants/email-send.constants";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { MILLISECONDS } from "../constants/time-constants";
import {
  EmailSendAttempt,
  QueuedNewEmailPayload,
  QueuedReplyPayload,
} from "../database/entities/email-send-attempt.entity";
import { EmailAdminService } from "../emails/email-admin.service";
import { appendSignature } from "../emails/email-controller.helpers";
import { EmailProviderManager } from "../emails/email-provider-manager.service";
import { UserEncryptionService } from "../encryption/user-encryption.service";
import { PusherService } from "../pusher/pusher.service";
import { registerWorker } from "../queue/register-worker";
import { RepliesService } from "../replies/replies.service";
import { UsersService } from "../users/users.service";
import { logErrorToFile } from "../utils/error-logger";
import {
  EmailSendQueueService,
  SendQueuedEmailJobData,
} from "./email-send-queue.service";
import {
  decodeAttachments,
  decodeInlineImages,
} from "./queued-attachment.helpers";

/** Provider ids returned by every send path. */
interface SentMessage {
  messageId: string;
  threadId: string;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Runs the actual provider send for messages queued by the send endpoints, then
 * tells the client what really happened over Pusher.
 *
 * The client shows an optimistic "sent" the moment the endpoint returns; this
 * processor is what makes that honest. Every attempt ends in exactly one
 * outcome event — success with the provider's real ids, or a failure the user
 * can retry from — including when a worker dies mid-send (see the sweeper).
 */
@Injectable()
export class EmailSendProcessor implements OnModuleInit {
  private readonly logger = new Logger(EmailSendProcessor.name);

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
    private readonly sendQueueService: EmailSendQueueService,
    private readonly repliesService: RepliesService,
    private readonly emailProviderManager: EmailProviderManager,
    private readonly emailAdminService: EmailAdminService,
    private readonly usersService: UsersService,
    private readonly userEncryptionService: UserEncryptionService,
    private readonly pusherService: PusherService,
  ) {}

  async onModuleInit(): Promise<void> {
    await registerWorker<SendQueuedEmailJobData>(
      this.boss,
      JOB_NAMES.SEND_QUEUED_EMAIL,
      async (job) => this.handleSend(job.data),
    );
    await registerWorker(
      this.boss,
      JOB_NAMES.SWEEP_STALLED_EMAIL_SENDS,
      async () => this.sweepStalledSends(),
    );
    await this.boss.schedule(
      JOB_NAMES.SWEEP_STALLED_EMAIL_SENDS,
      SEND_SWEEP_CRON,
      {},
      { tz: "UTC" },
    );
    this.logger.log(
      "EmailSendProcessor initialized - send-queued-email and sweep-stalled-email-sends handlers registered",
    );
  }

  private async handleSend(jobData: SendQueuedEmailJobData): Promise<void> {
    const { userId, sendId } = jobData;

    // Claiming, sending and storing all touch encrypted columns, so the whole
    // job runs under the user's KMS key just like the HTTP path does.
    await this.userEncryptionService.withUserKey(userId, async () => {
      const attempt = await this.sendQueueService.claimForSending(sendId);
      if (!attempt) {
        // Already sending, sent or failed — a duplicate/retried job must never
        // put a second copy of the message on the wire.
        this.logger.log(`Send attempt ${sendId} not claimable, skipping`);
        return;
      }

      try {
        const sent = await this.dispatch(userId, attempt);
        await this.sendQueueService.markSent(attempt.id, sent);
        await this.pusherService.triggerEmailSendSucceeded(userId, {
          sendId: attempt.id,
          sendType: attempt.sendType,
          emailId: attempt.emailId ?? undefined,
          messageId: sent.messageId,
          threadId: sent.threadId,
        });
      } catch (error: unknown) {
        await this.handleSendError(attempt, error);
      }
    });
  }

  private dispatch(
    userId: string,
    attempt: EmailSendAttempt,
  ): Promise<SentMessage> {
    if (attempt.sendType === EMAIL_SEND_TYPE.REPLY) {
      return this.dispatchReply(userId, attempt);
    }
    return this.dispatchNewEmail(userId, attempt);
  }

  private async dispatchReply(
    userId: string,
    attempt: EmailSendAttempt,
  ): Promise<SentMessage> {
    const payload = attempt.payload as QueuedReplyPayload;
    if (!attempt.emailId) {
      throw new Error(`Reply send attempt ${attempt.id} has no source email`);
    }
    return this.repliesService.sendReply(
      userId,
      attempt.emailId,
      payload.body,
      {
        attachments: decodeAttachments(payload.attachments),
        inlineImages: decodeInlineImages(payload.inlineImages),
        expectedReplyHours: payload.expectedReplyHours,
        forwardAttachmentIds: payload.forwardAttachmentIds,
        recipients: payload.recipients,
        cc: payload.cc,
        bcc: payload.bcc,
        subject: payload.subject,
        isForward: payload.isForward,
        keepInAction: payload.keepInAction,
      },
    );
  }

  private async dispatchNewEmail(
    userId: string,
    attempt: EmailSendAttempt,
  ): Promise<SentMessage> {
    const payload = attempt.payload as QueuedNewEmailPayload;
    const provider = await this.emailProviderManager.getPrimaryProvider(userId);
    if (!provider) {
      throw new Error("No email provider connected");
    }

    const user = await this.usersService.findOne(userId);
    const sent = await provider.sendEmail(userId, {
      to: payload.to,
      subject: payload.subject,
      body: appendSignature(payload.body, user?.emailSignature),
      cc: payload.cc,
      bcc: payload.bcc,
      attachments: decodeAttachments(payload.attachments),
    });

    const allRecipients = [
      ...payload.to,
      ...(payload.cc ?? []),
      ...(payload.bcc ?? []),
    ];
    await this.emailAdminService.trackEmailRecipients(userId, allRecipients);

    return sent;
  }

  /**
   * Retries a send until its budget is spent, then tells the user once.
   *
   * Throwing hands the job back to pg-boss for another run; on the final
   * attempt we swallow the error instead, so the job completes having already
   * published the failure rather than dying silently in the dead-letter state.
   */
  private async handleSendError(
    attempt: EmailSendAttempt,
    error: unknown,
  ): Promise<void> {
    const detail = describeError(error);
    this.logger.error(
      `Send attempt ${attempt.id} failed (attempt ${attempt.attempts}): ${detail}`,
    );
    logErrorToFile(
      `Background email send failed (sendId: ${attempt.id})`,
      error,
      EmailSendProcessor.name,
    );

    if (!this.sendQueueService.hasExhaustedAttempts(attempt)) {
      await this.sendQueueService.releaseForRetry(attempt.id, detail);
      throw error;
    }

    await this.failAttempt(
      attempt,
      EMAIL_SEND_FAILURE_REASON.PROVIDER_REJECTED,
      detail,
    );
  }

  private async failAttempt(
    attempt: EmailSendAttempt,
    reason: EmailSendFailureReason,
    detail: string,
  ): Promise<void> {
    await this.sendQueueService.markFailed(attempt.id, reason, detail);
    await this.pusherService.triggerEmailSendFailed(attempt.userId, {
      sendId: attempt.id,
      sendType: attempt.sendType,
      emailId: attempt.emailId ?? undefined,
      reason,
    });
  }

  /**
   * Safety net that makes a worker crash survivable: re-enqueues sends whose
   * job was lost before any provider call, and closes out sends whose worker
   * died with a call possibly in flight. The latter are never re-sent — the
   * user is told delivery could not be confirmed rather than risking a
   * duplicate message.
   */
  private async sweepStalledSends(): Promise<void> {
    const now = Date.now();

    const stranded = await this.sendQueueService.findStaleQueued(
      new Date(now - STALE_QUEUED_MINUTES * MILLISECONDS.MINUTE),
    );
    for (const attempt of stranded) {
      await this.sendQueueService.requeue(attempt);
    }

    const unconfirmed = await this.sendQueueService.findStaleSending(
      new Date(now - STALE_SENDING_MINUTES * MILLISECONDS.MINUTE),
    );
    for (const attempt of unconfirmed) {
      this.logger.warn(
        `Send attempt ${attempt.id} stalled while sending - reporting as unconfirmed`,
      );
      await this.failAttempt(
        attempt,
        EMAIL_SEND_FAILURE_REASON.UNCONFIRMED,
        "Worker stopped responding while the message was being sent",
      );
    }
  }
}
