import { Repository } from "typeorm";

import { PRIORITY_SCORES } from "../constants/priority-constants";
import { EmailThread } from "../database/entities/email-thread.entity";

/**
 * Un-batches a thread for immediate delivery when its priority score is high
 * enough. No-op for threads already visible (starred + delivered) or below the
 * HIGH threshold. Shared by the LLM and deterministic-rule priority paths.
 */
export async function applyEmergencyDelivery(
  threadRepository: Repository<EmailThread>,
  args: {
    emailThreadId: string;
    userId: string;
    finalScore: number;
    starCount: number;
    isBatched: boolean;
  },
): Promise<void> {
  const { emailThreadId, userId, finalScore, starCount, isBatched } = args;
  // Starred + already delivered (was visible in Action/Follow-Up before the
  // email arrived): no-op.
  if (starCount > 0 && !isBatched) return;
  if (finalScore < PRIORITY_SCORES.HIGH_THRESHOLD) return;
  await threadRepository.update(
    { id: emailThreadId, userId },
    {
      isBatched: false,
      batchReleaseAt: null,
      wasDeliveredEarly: true,
      batchDecisionReason: `Emergency delivery (score ${finalScore})`,
    },
  );
}
