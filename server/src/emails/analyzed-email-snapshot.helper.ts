import { Logger } from "@nestjs/common";
import type { Repository } from "typeorm";

import type { Email } from "../database/entities/email.entity";
import type { CategoryDecisionAnalyzedEmail } from "./category-decision-trace.types";

const logger = new Logger("AnalyzedEmailSnapshot");

/**
 * Records which email a category/priority decision was computed from and
 * whether it was the thread's newest message at the time. The pipeline only
 * ever analyses ONE email's content, so when that email isn't the latest the
 * category can lag reality — this snapshot makes that visible in the debug
 * view. Never throws (a failed lookup just drops the latest/count fields).
 */
export async function buildAnalyzedEmailSnapshot(
  emailRepository: Repository<Email>,
  email: Email,
  userId: string,
  contentSource: CategoryDecisionAnalyzedEmail["contentSource"],
): Promise<CategoryDecisionAnalyzedEmail> {
  const snapshot: CategoryDecisionAnalyzedEmail = {
    emailId: email.id,
    receivedAt: email.receivedAt ? email.receivedAt.toISOString() : null,
    ...(contentSource ? { contentSource } : {}),
  };
  if (!email.emailThreadId) {
    return { ...snapshot, wasLatestInThread: true, threadEmailCount: 1 };
  }
  try {
    const [latest, threadEmailCount] = await Promise.all([
      emailRepository.findOne({
        where: { emailThreadId: email.emailThreadId, userId },
        order: { receivedAt: "DESC" },
        select: { id: true, receivedAt: true },
      }),
      emailRepository.count({
        where: { emailThreadId: email.emailThreadId, userId },
      }),
    ]);
    const analyzedMs = email.receivedAt ? email.receivedAt.getTime() : null;
    const latestMs = latest?.receivedAt ? latest.receivedAt.getTime() : null;
    const wasLatestInThread =
      !latest ||
      latest.id === email.id ||
      analyzedMs === null ||
      latestMs === null ||
      analyzedMs >= latestMs;
    return { ...snapshot, wasLatestInThread, threadEmailCount };
  } catch (error) {
    logger.warn(
      `buildAnalyzedEmailSnapshot: latest-email lookup failed for thread ${email.emailThreadId}: ${(error as Error).message}`,
    );
    return snapshot;
  }
}
