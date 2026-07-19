/**
 * Decides whether a refine-priority run can skip an email because its thread
 * already carries a valid, current priority breakdown. Extracted from
 * `LLMPriorityBatchService` so the skip policy is readable and testable on its
 * own (the service keeps thin delegating methods for its existing callers).
 */
import { Logger } from "@nestjs/common";
import { Repository } from "typeorm";

import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { USER_CATEGORY_SOURCE } from "./category-precedence.helper";

/**
 * True when an email newer than the last priority calculation exists in the
 * thread — new mail always forces a fresh analysis.
 */
export async function threadHasNewEmails(
  emailRepository: Repository<Email>,
  thread: EmailThread | null,
  email: Email,
  threadPriorityExplanation: { calculatedAt?: string } | null | undefined,
): Promise<boolean> {
  if (!thread || !email.receivedAt || !email.emailThreadId) {
    return false;
  }

  const mostRecentEmail = await emailRepository.findOne({
    where: { emailThreadId: email.emailThreadId },
    order: { receivedAt: "DESC" },
    select: {
      id: true,
      receivedAt: true,
    },
  });

  if (!mostRecentEmail) return false;

  const parsedCalculatedAt = threadPriorityExplanation?.calculatedAt
    ? new Date(threadPriorityExplanation.calculatedAt)
    : null;
  // An unparseable calculatedAt yields Invalid Date (truthy, compares false
  // to everything) — treat it as absent so the createdAt floor takes over.
  const priorityCalculatedAt =
    parsedCalculatedAt && !Number.isNaN(parsedCalculatedAt.getTime())
      ? parsedCalculatedAt
      : null;
  // NEVER fall back to thread.updatedAt: it is bumped by writes unrelated to
  // priority calculation (sync star/archive batch updates, isProcessingPriority
  // locks, updateThreadAfterSave). A just-touched thread would then look
  // "already calculated" and a genuinely new email would be skipped, so the
  // thread never gets re-categorised (categorySource/categoryId/decision trace
  // go stale). createdAt is immutable and a safe floor: on a legacy thread with
  // no recorded calculatedAt, any newer email forces a fresh run, which records
  // calculatedAt and self-heals subsequent skips.
  const lastCalculationTime = priorityCalculatedAt || thread.createdAt;

  if (mostRecentEmail.id === email.id) {
    return email.receivedAt > lastCalculationTime;
  }
  return Boolean(
    mostRecentEmail.receivedAt &&
    mostRecentEmail.receivedAt > lastCalculationTime,
  );
}

/**
 * True when the thread already has a valid, current breakdown and nothing
 * (force flag, new mail, stale/incomplete structure, in-flight calculation)
 * requires a re-run. Logs the decision the way the service always has.
 */
export interface SkipRecalcArgs {
  emailRepository: Repository<Email>;
  logger: Logger;
  thread: EmailThread | null;
  forceRecalculate: boolean | undefined;
  email: Email;
  workerId: string;
  emailId: string;
}

/** Logs why a recalculation is happening (force, new mail, stale structure). */
function logRecalculationReason(
  logger: Logger,
  args: SkipRecalcArgs,
  flags: {
    hasNewEmails: boolean;
    hasOldStructure: boolean;
    hasValidBreakdown: boolean;
    hasCalculatingItems: boolean;
    hasBrokenCategory: boolean;
  },
): void {
  const { forceRecalculate, email, workerId, emailId } = args;
  if (forceRecalculate) {
    logger.log(
      `[Worker ${workerId}] Force recalculating priority for email ${emailId} (forceRecalculate=true)`,
    );
  }
  if (flags.hasNewEmails) {
    logger.log(
      `[Worker ${workerId}] Forcing priority recalculation for thread ${email.emailThreadId} due to new emails`,
    );
  }
  if (
    args.thread &&
    (flags.hasOldStructure ||
      !flags.hasValidBreakdown ||
      flags.hasCalculatingItems ||
      flags.hasBrokenCategory)
  ) {
    let reason: string;
    if (flags.hasOldStructure) {
      reason = "old";
    } else if (flags.hasCalculatingItems) {
      reason = "calculating items";
    } else if (flags.hasBrokenCategory) {
      reason = "broken category (source set, no categoryId)";
    } else {
      reason = "incomplete";
    }
    logger.log(
      `[Worker ${workerId}] Detected ${reason} priority structure for thread ${email.emailThreadId}, recalculating`,
    );
  }
}

export async function shouldSkipPriorityRecalculation(
  args: SkipRecalcArgs,
): Promise<boolean> {
  const {
    emailRepository,
    logger,
    thread,
    forceRecalculate,
    email,
    workerId,
    emailId,
  } = args;
  const threadPriorityExplanation = thread?.priorityExplanation;
  // priorityExplanation is JSONB — a legacy/corrupt row can hold a non-array
  // breakdown, which would TypeError on .some().
  const existingBreakdown = Array.isArray(threadPriorityExplanation?.breakdown)
    ? threadPriorityExplanation.breakdown
    : [];
  const hasOldStructure = existingBreakdown.some(
    (item) =>
      item.factor === "Base Score" ||
      item.factor === "🤖 AI Analysis" ||
      item.factor === "AI Analysis",
  );
  const hasValidBreakdown =
    existingBreakdown.length > 0 &&
    existingBreakdown.some(
      (item) => item.value !== 0 && item.value !== undefined,
    );

  const hasCalculatingItems = existingBreakdown.some(
    (item) =>
      item.description === "Calculating..." ||
      item.description?.includes("Calculating..."),
  );

  const hasNewEmails = await threadHasNewEmails(
    emailRepository,
    thread,
    email,
    threadPriorityExplanation,
  );

  // Contradictory category state: an automated source was recorded
  // ("priority"/"rule"/…) but no categoryId was stored — the resolved category
  // name never mapped to a real category, so the thread sits in "Other" with a
  // misleading "Set by step" and no decision trace. Never skip it: force a
  // re-run so the category and its trace get rewritten instead of staying
  // broken. `'user'` + null is EXCLUDED: that is a deliberate user move to
  // "Other" (an authoritative, valid state), so it must not trigger a re-run.
  const hasBrokenCategory =
    thread != null &&
    thread.categorySource != null &&
    thread.categorySource !== USER_CATEGORY_SOURCE &&
    thread.categoryId == null;

  if (
    !forceRecalculate &&
    threadPriorityExplanation?.breakdown &&
    existingBreakdown.length > 0 &&
    hasValidBreakdown &&
    !hasCalculatingItems &&
    !thread?.isProcessingPriority &&
    !hasOldStructure &&
    !hasNewEmails &&
    !hasBrokenCategory
  ) {
    const existingScore = existingBreakdown.reduce(
      (sum, item) => sum + (item.value || 0),
      0,
    );
    logger.log(
      `[Worker ${workerId}] Skipping priority refinement for email ${emailId} - already has priority breakdown with score: ${existingScore}`,
    );
    return true;
  }

  logRecalculationReason(logger, args, {
    hasNewEmails,
    hasOldStructure,
    hasValidBreakdown,
    hasCalculatingItems,
    hasBrokenCategory,
  });

  return false;
}
