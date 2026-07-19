import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { createHash } from "crypto";
import { Repository } from "typeorm";

import { CloudWatchService } from "../aws/cloudwatch.service";
import { findCategoryContextIdByName } from "../category-rules/category-rules-validate.helper";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import {
  ContextKey,
  UserContext,
} from "../database/entities/user-context.entity";
import { assignFamily } from "../local-model/category-family";
import { LocalModelDebugSnapshot } from "../local-model/local-model.types";
import { LocalModelInferenceService } from "../local-model/local-model-inference.service";
import { buildLocalModelInput } from "../local-model/local-model-input";
import { bandMidpointScore } from "../local-model/priority-band";
import { parseCategoryName } from "../utils/category-name.util";
import { BackgroundSummaryQueueService } from "./background-summary-queue.service";
import {
  analyzedEmailFromEmail,
  localModelDecisionTrace,
} from "./category-decision-trace.helper";
import { updateThreadCategoryWithPrecedence } from "./category-precedence.helper";
import { applyEmergencyDelivery } from "./emergency-delivery.helper";

const THREAD_ID_PREVIEW_LENGTH = 8;
const METRIC_LOCAL_MODEL_SKIP = "LocalModelSkip";
const HOLDOUT_HASH_HEX_LENGTH = 8;
const HOLDOUT_BUCKETS = 100;

/**
 * Promotion path for the local category/priority model (issue: promote local
 * model). Priority and category are independent heads: a confident priority
 * head (`priorityFallback=false`) is enough to write a band-midpoint priority
 * score WITHOUT an LLM call and tag the thread `prioritySource='local'`. The
 * category is applied alongside when it resolves to one of the user's real
 * categories (exact name match, or a confident FAMILY head narrowing to a
 * single-category family), OR when the category head is confidently "Other"
 * (no real category, but the model is sure).
 *
 * When the category head is UNconfident (`categoryFallback=true`) and resolves
 * to nothing, the thread lands in "Other" for now but is NOT sent to the
 * (expensive) `analyze_priority` LLM just to categorise it: the background
 * summary is always queued, and once it lands the summary-completion path
 * re-categorises the thread with the cheap category-only `categorise_summary`
 * call (see `recategoriseFromSummary`). The confident local priority is kept —
 * only the category is resolved by an LLM, and by the cheapest one.
 *
 * An unconfident priority head, a cold-start user with no model, or any error
 * returns false so the caller runs the LLM. That remainder is the holdout: it
 * still flows through the LLM and the shadow comparison, which is how we keep
 * measuring the model and gather the next round of training failures. Gated by
 * `LOCAL_MODEL_LIVE_ENABLED`; never throws.
 */
@Injectable()
export class LocalModelPromotionService {
  private readonly logger = new Logger(LocalModelPromotionService.name);

  constructor(
    @InjectRepository(EmailThread)
    private readonly emailThreadRepository: Repository<EmailThread>,
    @InjectRepository(UserContext)
    private readonly userContextRepository: Repository<UserContext>,
    private readonly inferenceService: LocalModelInferenceService,
    private readonly cloudWatchService: CloudWatchService,
    private readonly backgroundSummaryQueueService: BackgroundSummaryQueueService,
  ) {}

  /**
   * Decision + apply entry point shared by the single and batch refine paths.
   * Returns true when the local model handled the email (caller must NOT run the
   * LLM); false to fall through to the LLM. Never throws.
   */
  async tryHandle(
    userId: string,
    email: Email,
    thread: EmailThread | null,
    workerId: string,
  ): Promise<boolean> {
    if (
      !this.inferenceService.isLiveEnabled ||
      !email.emailThreadId ||
      !thread
    ) {
      return false;
    }
    try {
      const prediction = await this.inferenceService.predict(
        userId,
        buildLocalModelInput(email),
      );
      if (!prediction) {
        return false;
      }

      // Priority must always be confident to skip the (expensive) LLM.
      if (prediction.priorityFallback) {
        return false;
      }

      // Resolve the category: direct name match, else a confident FAMILY head
      // narrows to that family (two-stage). A null category is fine — priority
      // is applied and the thread lands in "Other". If the category head was
      // UNconfident (categoryFallback), the deferred summary-based
      // re-categorisation will classify it later with the cheap
      // `categorise_summary` call (persisted `localModelDebug.categoryFallback`
      // is the signal); we never spend `analyze_priority` just for the category.
      const categoryId = await this.resolveCategoryId(userId, prediction);

      // #6 forced-holdout eval: divert a deterministic sample of would-be-applied
      // threads to the LLM so applied accuracy can be scored against it (the
      // shadow comparison logs local-vs-LLM agreement for these confident cases).
      const holdoutRate = this.inferenceService.holdoutSampleRate;
      if (
        holdoutRate > 0 &&
        this.isHoldoutSample(email.emailThreadId, holdoutRate)
      ) {
        this.logger.log(
          JSON.stringify({
            event: "local_model_applied_eval",
            userId,
            threadId: email.emailThreadId,
            localCategory: prediction.category,
            localCategoryResolved: categoryId != null,
            localPriorityBand: prediction.priorityBand,
            categoryFallback: prediction.categoryFallback,
            note: "diverted to LLM for applied-accuracy measurement",
          }),
        );
        return false;
      }

      await this.applyPrediction({
        email,
        thread,
        prediction,
        categoryId,
        userId,
        workerId,
      });
      await this.cloudWatchService.putMetric(METRIC_LOCAL_MODEL_SKIP, 1);
      const categoryLabel = categoryId
        ? prediction.category
        : this.unresolvedCategoryLabel(prediction.categoryFallback);
      this.logger.log(
        `[Worker ${workerId}] Skipped analyze_priority via local model (category="${categoryLabel}" band=${prediction.priorityBand}) for email ${email.id}`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `[Worker ${workerId}] Local model promotion failed for email ${email.id}; falling back to LLM`,
        error,
      );
      return false;
    }
  }

  /**
   * Resolve the model's predicted category to a user category id. Direct
   * exact-name match first; failing that, a confident FAMILY head lets us
   * narrow to that family (two-stage): if the family holds exactly one of the
   * user's categories, use it; otherwise require an exact name match within the
   * family. Never invents a category — returns null when nothing resolves.
   */
  private async resolveCategoryId(
    userId: string,
    prediction: NonNullable<
      Awaited<ReturnType<LocalModelInferenceService["predict"]>>
    >,
  ): Promise<string | null> {
    const direct = await findCategoryContextIdByName(
      this.userContextRepository,
      userId,
      prediction.category,
    );
    if (direct) {
      return direct;
    }
    if (prediction.familyFallback) {
      return null;
    }
    const contexts = await this.userContextRepository.find({
      where: { userId, contextKey: ContextKey.EMAIL_CATEGORY },
      select: { contextId: true, contextValue: true },
    });
    const inFamily = contexts.filter(
      (ctx) =>
        ctx.contextValue &&
        assignFamily(parseCategoryName(ctx.contextValue)) === prediction.family,
    );
    // A confident family whose threads all map to a single user category lets us
    // apply that category. Exact-name matching within the family would be dead
    // code — the direct name lookup above already tried (and failed) that.
    if (inFamily.length === 1) {
      return inFamily[0].contextId;
    }
    return null;
  }

  /**
   * Deterministic per-thread sampler for the applied-accuracy holdout: stable
   * across re-runs (hash of the thread id, not random) so the same thread is
   * always in or out of the sample at a given rate.
   */
  private isHoldoutSample(threadId: string, rate: number): boolean {
    const hash = createHash("md5")
      .update(threadId)
      .digest("hex")
      .slice(0, HOLDOUT_HASH_HEX_LENGTH);
    return parseInt(hash, 16) % HOLDOUT_BUCKETS < rate;
  }

  /**
   * Debug snapshot for a thread the local model decided: decidedBy='local' and
   * no LLM answer to compare against, so the agree fields are null/false (this
   * thread never ran the LLM).
   */
  private buildAppliedDebugSnapshot(
    prediction: NonNullable<
      Awaited<ReturnType<LocalModelInferenceService["predict"]>>
    >,
  ): LocalModelDebugSnapshot {
    return {
      evaluatedAt: new Date().toISOString(),
      decidedBy: "local",
      category: prediction.category,
      family: prediction.family,
      categoryConfidence: prediction.categoryConfidence,
      categoryMargin: prediction.categoryMargin,
      categoryFallback: prediction.categoryFallback,
      familyConfidence: prediction.familyConfidence,
      familyFallback: prediction.familyFallback,
      priorityBand: prediction.priorityBand,
      priorityConfidence: prediction.priorityConfidence,
      priorityFallback: prediction.priorityFallback,
      llmCategory: null,
      llmPriorityBand: null,
      categoryAgree: false,
      priorityAgree: false,
      llmFamily: null,
      familyAgree: null,
    };
  }

  /** Short label for the unresolved-category log line. */
  private unresolvedCategoryLabel(categoryFallback: boolean): string {
    return categoryFallback
      ? "Other (pending summary re-categorisation)"
      : "Other (no user match)";
  }

  /** Category explanation when the model applied priority but no real category. */
  private unresolvedCategoryExplanation(prediction: {
    priorityBand: string;
    category: string;
    categoryFallback: boolean;
  }): string {
    return prediction.categoryFallback
      ? `Local model applied priority "${prediction.priorityBand}" (confident); category uncertain — awaiting re-categorisation from the thread summary.`
      : `Local model applied priority "${prediction.priorityBand}" (confident); category "${prediction.category}" matched no user category — thread stays in "Other".`;
  }

  private async applyPrediction(args: {
    email: Email;
    thread: EmailThread;
    prediction: NonNullable<
      Awaited<ReturnType<LocalModelInferenceService["predict"]>>
    >;
    categoryId: string | null;
    userId: string;
    workerId: string;
  }): Promise<void> {
    const { email, thread, prediction, categoryId, userId, workerId } = args;
    const emailThreadId = email.emailThreadId as string;

    const finalCategoryId = categoryId;

    const decisionTrace = localModelDecisionTrace({
      decidedAt: new Date().toISOString(),
      prediction,
      categoryId,
      finalCategoryId,
      analyzedEmail: analyzedEmailFromEmail(email),
    });

    const score = bandMidpointScore(prediction.priorityBand);
    const priorityExplanation = {
      score,
      breakdown: [
        {
          factor: "🧠 Local model",
          value: score,
          description: `Priority band "${prediction.priorityBand}" predicted by the local model (category "${prediction.category}")`,
        },
      ],
      dimensions: {
        urgency: { score: 0, reasons: ["Set by local model prediction"] },
        goalAlignment: { score: 0, reasons: [] },
        vipContact: { score: 0, reasons: [] },
        sentiment: { score: 0, type: "neutral", reasons: [] },
      },
      calculatedAt: new Date().toISOString(),
    };

    const localModelDebug = this.buildAppliedDebugSnapshot(prediction);

    await this.emailThreadRepository.update(
      { id: emailThreadId },
      {
        priorityScore: score,
        prioritySource: "local" as const,
        priorityExplanation,
        localModelDebug,
        isProcessingPriority: false,
        aiProcessingDeferred: false,
      },
    );

    // Category columns go through the precedence guard: the local model may
    // replace a previous automated pick but never a user- or rule-pinned one.
    const applied = await updateThreadCategoryWithPrecedence(
      this.emailThreadRepository,
      {
        where: { id: emailThreadId },
        source: "local",
        set: {
          categoryId: finalCategoryId,
          categoryExplanation: finalCategoryId
            ? `Local model (confident): category "${prediction.category}", priority "${prediction.priorityBand}"`
            : this.unresolvedCategoryExplanation(prediction),
          categorySource: "local" as const,
          categoryDecisionTrace: decisionTrace,
        },
      },
    );
    if (applied === 0) {
      this.logger.log(
        `[Worker ${workerId}] Local-model category write blocked by precedence for thread ${emailThreadId} (user/rule pinned) — priority updated, category kept`,
      );
    }

    await applyEmergencyDelivery(this.emailThreadRepository, {
      emailThreadId,
      userId,
      finalScore: score,
      starCount: thread.starCount ?? 0,
      isBatched: thread.isBatched ?? true,
    });

    await this.backgroundSummaryQueueService.maybeQueueBackgroundSummary({
      userId,
      emailId: email.id,
      threadId: emailThreadId,
      priorityScore: score,
    });

    this.logger.log(
      `[Worker ${workerId}] Local-model priority+category applied to thread ${emailThreadId.substring(0, THREAD_ID_PREVIEW_LENGTH)}... score=${score} category="${prediction.category}" (LLM skipped)`,
    );
  }
}
