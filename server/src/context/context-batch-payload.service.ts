import { Injectable, Logger } from "@nestjs/common";

import { GMAIL_LABELS } from "../constants/email-labels";
import { BODY_PREVIEW_LENGTHS } from "../constants/llm-constants";
import { MILLISECONDS, MINUTES_PER_HOUR } from "../constants/time-constants";
import { cleanEmailContent } from "../llm/email-content-cleaner";
import { ThreadData } from "./context-gmail-data.service";

export type BatchPayloadItem = {
  threadId?: string;
  from: string;
  fromName?: string;
  subject: string;
  body: string;
  receivedAt: string;
  isRead?: boolean;
  timeToReply?: number | null;
  starCount?: number;
  isArchived?: boolean;
};

@Injectable()
export class ContextBatchPayloadService {
  private readonly logger = new Logger(ContextBatchPayloadService.name);

  buildBatchPayloads(
    threads: ThreadData[],
    userEmail: string | null,
    batchSize: number,
  ): BatchPayloadItem[][] {
    const processedBatches: BatchPayloadItem[][] = [];

    for (let i = 0; i < threads.length; i += batchSize) {
      const batchThreads = threads.slice(i, i + batchSize);
      const batchPayloads = batchThreads
        .map((thread) => this.buildThreadPayloadItem(thread, userEmail))
        .filter((item): item is NonNullable<typeof item> => item !== null);
      processedBatches.push(batchPayloads);
    }

    return processedBatches;
  }

  buildThreadPayloadItem(
    thread: ThreadData,
    userEmail: string | null,
  ): BatchPayloadItem | null {
    const firstEmail = thread.emails
      ?.slice()
      .sort(
        (emailA, emailB) =>
          emailA.receivedAt.getTime() - emailB.receivedAt.getTime(),
      )[0];

    if (!firstEmail) {
      this.logger.warn(
        `[CONTEXT-ANALYSIS] Thread ${thread.id} has no emails, skipping`,
      );
      return null;
    }

    const userReplied = thread.emails?.some(
      (email) =>
        email.labelIds?.includes(GMAIL_LABELS.SENT) ||
        (userEmail && email.from.toLowerCase() === userEmail.toLowerCase()),
    );

    const timeToReply = this.computeQuickestReply(
      thread,
      userEmail,
      userReplied ?? false,
    );

    return {
      threadId: thread.id,
      from: firstEmail.from,
      fromName: firstEmail.fromName,
      subject: firstEmail.subject,
      body: cleanEmailContent(
        firstEmail.body,
        firstEmail.htmlBody,
        BODY_PREVIEW_LENGTHS.CLASSIFICATION_PREVIEW,
      ),
      receivedAt: firstEmail.receivedAt.toISOString(),
      isRead: firstEmail.isRead,
      timeToReply,
      starCount: thread.starCount || 0,
      isArchived: thread.isArchived || false,
    };
  }

  computeQuickestReply(
    thread: ThreadData,
    userEmail: string | null,
    userReplied: boolean,
  ): number | null {
    if (!userReplied) return null;

    const isUserEmail = (from: string) =>
      userEmail ? from.toLowerCase() === userEmail.toLowerCase() : false;

    const sentEmails = thread.emails.filter(
      (email) =>
        email.labelIds?.includes(GMAIL_LABELS.SENT) || isUserEmail(email.from),
    );
    const receivedEmails = thread.emails.filter(
      (email) =>
        !email.labelIds?.includes(GMAIL_LABELS.SENT) &&
        !isUserEmail(email.from),
    );

    if (sentEmails.length === 0 || receivedEmails.length === 0) return null;

    const replyTimeHours =
      (sentEmails[0].receivedAt.getTime() -
        receivedEmails[0].receivedAt.getTime()) /
      MILLISECONDS.HOUR;

    return replyTimeHours >= 0 ? replyTimeHours * MINUTES_PER_HOUR : null;
  }
}
