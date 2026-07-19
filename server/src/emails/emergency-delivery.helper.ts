import { Repository } from "typeorm";

import { PRIORITY_SCORES } from "../constants/priority-constants";
import { EmailThread } from "../database/entities/email-thread.entity";

/**
 * Un-batches a thread for immediate delivery when its priority score is high
 * enough OR its urgency dimension is critical (a time-critical email — e.g. a
 * same-day cancellation — must reach the user now even when the composite
 * score stays moderate). No-op for threads already visible (starred +
 * delivered) or below both thresholds. Shared by the LLM and
 * deterministic-rule priority paths.
 */
export async function applyEmergencyDelivery(
  threadRepository: Repository<EmailThread>,
  args: {
    emailThreadId: string;
    userId: string;
    finalScore: number;
    starCount: number;
    isBatched: boolean;
    /** LLM urgency dimension (0–100). Omitted on the deterministic-rule path. */
    urgencyScore?: number;
  },
): Promise<void> {
  const { emailThreadId, userId, finalScore, starCount, isBatched } = args;
  const urgencyScore = args.urgencyScore ?? 0;
  // Starred + already delivered (was visible in Action/Follow-Up before the
  // email arrived): no-op.
  if (starCount > 0 && !isBatched) return;
  const isCriticalUrgency =
    urgencyScore >= PRIORITY_SCORES.CRITICAL_URGENCY_THRESHOLD;
  if (finalScore < PRIORITY_SCORES.HIGH_THRESHOLD && !isCriticalUrgency) {
    return;
  }
  await threadRepository.update(
    { id: emailThreadId, userId },
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
