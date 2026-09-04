import { Injectable, Logger } from "@nestjs/common";

import { GMAIL_LABELS } from "../constants/email-labels";
import { BODY_PREVIEW_LENGTHS } from "../constants/llm-constants";
import { cleanEmailContent } from "../llm/email-content-cleaner";
import type { DiscoveryThreadStub } from "../llm/llm-discover-user-context";
import { ThreadData, ThreadEmail } from "./context-gmail-data.service";

/**
 * Turns fetched provider threads into the tiny stubs the discovery prompt
 * consumes. Only the first message from someone OTHER than the user
 * represents a thread (a thread the user started is not "received"), and
 * bodies are cut to a short snippet so 100 stubs stay a few KB.
 */
@Injectable()
export class ContextBatchPayloadService {
  private readonly logger = new Logger(ContextBatchPayloadService.name);

  buildDiscoveryBatches(
    threads: ThreadData[],
    userEmail: string | null,
    batchSize: number,
  ): DiscoveryThreadStub[][] {
    const stubs = threads
      .map((thread) => this.buildDiscoveryStub(thread, userEmail))
      .filter((stub): stub is DiscoveryThreadStub => stub !== null);

    const batches: DiscoveryThreadStub[][] = [];
    for (let index = 0; index < stubs.length; index += batchSize) {
      batches.push(stubs.slice(index, index + batchSize));
    }
    return batches;
  }

  buildDiscoveryStub(
    thread: ThreadData,
    userEmail: string | null,
  ): DiscoveryThreadStub | null {
    const emails = (thread.emails ?? [])
      .slice()
      .sort(
        (emailA, emailB) =>
          emailA.receivedAt.getTime() - emailB.receivedAt.getTime(),
      );
    if (emails.length === 0) {
      this.logger.warn(
        `[CONTEXT-DISCOVERY] Thread ${thread.id} has no emails, skipping`,
      );
      return null;
    }

    const isFromUser = (email: ThreadEmail) =>
      email.labelIds?.includes(GMAIL_LABELS.SENT) ||
      (!!userEmail && email.from.toLowerCase() === userEmail.toLowerCase());

    const firstReceived = emails.find((email) => !isFromUser(email));
    if (!firstReceived) {
      return null;
    }

    return {
      threadId: thread.id,
      from: firstReceived.from,
      fromName: firstReceived.fromName,
      subject: firstReceived.subject,
      snippet: cleanEmailContent(
        firstReceived.body,
        firstReceived.htmlBody,
        BODY_PREVIEW_LENGTHS.DISCOVERY_SNIPPET,
      )
        .replace(/\s+/g, " ")
        .trim(),
      receivedAt: firstReceived.receivedAt.toISOString(),
      userReplied: emails.some(isFromUser),
    };
  }
}
