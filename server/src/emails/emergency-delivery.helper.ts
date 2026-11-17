import { MoreThan, Repository } from "typeorm";

import { PRIORITY_SCORES } from "../constants/priority-constants";
import { EmailThread } from "../database/entities/email-thread.entity";

/**
 * Un-batches a thread for immediate delivery when its priority score is high
 * enough OR its urgency dimension is critical (a time-critical email — e.g. a
 * same-day cancellation — must reach the user now even when the composite
 * score stays moderate). Shared by the LLM, local-model and deterministic-rule
 * priority paths.
 *
 * Only a thread that is still held in a batch can be delivered early. Threads
 * that were never batched — the first import ("Initial sync"), a disabled
 * schedule, an urgent bypass, a starred thread already visible — or whose
 * batch window has already passed were delivered on time, so they are left
 * alone. Flagging those made a week-old email from the first import read
 * "Urgent – delivered early". The batch check is repeated in the UPDATE's WHERE
 * so a stale thread snapshot can't flag a thread that has since been released.
 */
export async function applyEmergencyDelivery(
  threadRepository: Repository<EmailThread>,
  args: {
    emailThreadId: string;
    userId: string;
    finalScore: number;
    isBatched: boolean;
    /** LLM urgency dimension (0–100). Omitted on the deterministic-rule path. */
    urgencyScore?: number;
  },
): Promise<void> {
  const { emailThreadId, userId, finalScore, isBatched } = args;
  if (!isBatched) return;
  const urgencyScore = args.urgencyScore ?? 0;
  const isCriticalUrgency =
    urgencyScore >= PRIORITY_SCORES.CRITICAL_URGENCY_THRESHOLD;
  if (finalScore < PRIORITY_SCORES.HIGH_THRESHOLD && !isCriticalUrgency) {
    return;
  }
  await threadRepository.update(
    {
      id: emailThreadId,
      userId,
      isBatched: true,
      batchReleaseAt: MoreThan(new Date()),
    },
    {
      isBatched: false,
      batchReleaseAt: null,
      wasDeliveredEarly: true,
      batchDecisionReason: isCriticalUrgency
        ? `Emergency delivery (critical urgency ${urgencyScore})`
        : `Emergency delivery (score ${finalScore})`,
    },
  );
}
