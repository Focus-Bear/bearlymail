import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { Repository } from "typeorm";

import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { assignFamily } from "./category-family";
import {
  LocalModelDebugSnapshot,
  LocalModelPrediction,
  LocalModelThreadInput,
} from "./local-model.types";
import { buildLocalModelInput } from "./local-model-input";
import { priorityBand } from "./priority-band";

/** Value of LOCAL_MODEL_SHADOW_ENABLED that turns shadow mode on. */
const SHADOW_ENABLED_FLAG = "true";
/** Value of LOCAL_MODEL_LIVE_ENABLED that lets confident predictions skip the LLM. */
const LIVE_ENABLED_FLAG = "true";
/** Lambda envelope statusCode at or above which we treat the call as failed. */
const HTTP_BAD_REQUEST = 400;
const HOLDOUT_RATE_MIN = 0;
const HOLDOUT_RATE_MAX = 100;

/**
 * Calls the local category/priority model served by the inference Lambda
 * (see local-models/ and the serving CDK stack). The model is the cheap first
 * pass: when it is confident the caller can use its prediction and skip the
 * LLM; otherwise the caller falls through to the existing LLM pipeline.
 *
 * Every failure path returns null rather than throwing, so a model outage can
 * never block email processing — it just means everything falls back to the LLM.
 *
 * Rollout is gated by `LOCAL_MODEL_SHADOW_ENABLED`: while in shadow mode the
 * service only predicts-and-logs (via {@link compareInShadowMode}) and the LLM
 * stays authoritative. Promote to using predictions only after the live
 * agreement matches the offline evaluation.
 */
@Injectable()
export class LocalModelInferenceService {
  private readonly logger = new Logger(LocalModelInferenceService.name);
  private readonly client: LambdaClient;
  private readonly functionName: string | undefined;
  private readonly shadowEnabled: boolean;
  private readonly liveEnabled: boolean;
  private readonly holdoutRate: number;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(EmailThread)
    private readonly emailThreadRepository: Repository<EmailThread>,
  ) {
    const region =
      this.configService.get<string>("AWS_REGION") || "ap-southeast-2";
    this.client = new LambdaClient({ region });
    this.functionName = this.configService.get<string>(
      "LOCAL_MODEL_INFERENCE_FUNCTION",
    );
    this.shadowEnabled =
      this.configService.get<string>("LOCAL_MODEL_SHADOW_ENABLED") ===
      SHADOW_ENABLED_FLAG;
    this.liveEnabled =
      this.configService.get<string>("LOCAL_MODEL_LIVE_ENABLED") ===
      LIVE_ENABLED_FLAG;
    const rawRate = parseInt(
      this.configService.get<string>("LOCAL_MODEL_HOLDOUT_SAMPLE_RATE") ?? "",
      10,
    );
    this.holdoutRate = Number.isFinite(rawRate)
      ? Math.min(HOLDOUT_RATE_MAX, Math.max(HOLDOUT_RATE_MIN, rawRate))
      : HOLDOUT_RATE_MIN;
  }

  /** True when a function name is configured — otherwise the service is a no-op. */
  isConfigured(): boolean {
    return !!this.functionName;
  }

  get isShadowEnabled(): boolean {
    return this.shadowEnabled;
  }

  /**
   * True when confident predictions are allowed to set the category/priority and
   * skip the LLM (`LOCAL_MODEL_LIVE_ENABLED=true`). The kill switch for the
   * promotion path; independent of shadow logging, which keeps measuring the
   * low-confidence holdout that still runs the LLM.
   */
  get isLiveEnabled(): boolean {
    return this.liveEnabled && !!this.functionName;
  }

  /**
   * Percentage (0–100) of would-be-applied confident threads to divert to the
   * LLM as a measurement holdout, so applied accuracy can be scored against the
   * LLM. Default 0 (disabled).
   */
  get holdoutSampleRate(): number {
    return this.holdoutRate;
  }

  /**
   * Invokes the inference Lambda for one thread. Returns the prediction, or null
   * if the model isn't configured, the user has no model yet (cold start), or
   * anything goes wrong — in every such case the caller should use the LLM.
   */
  async predict(
    userId: string,
    thread: LocalModelThreadInput,
  ): Promise<LocalModelPrediction | null> {
    if (!this.functionName) {
      return null;
    }
    try {
      const response = await this.client.send(
        new InvokeCommand({
          FunctionName: this.functionName,
          Payload: Buffer.from(JSON.stringify({ userId, thread })),
        }),
      );
      if (response.FunctionError || !response.Payload) {
        this.logger.warn(
          `Local-model invoke returned error for user ${userId}: ${response.FunctionError ?? "no payload"}`,
        );
        return null;
      }
      // The handler returns { statusCode, body } where body is a JSON string.
      const envelope = JSON.parse(Buffer.from(response.Payload).toString());
      const prediction =
        typeof envelope.body === "string"
          ? (JSON.parse(envelope.body) as LocalModelPrediction)
          : (envelope.body as LocalModelPrediction);
      if (envelope.statusCode && envelope.statusCode >= HTTP_BAD_REQUEST) {
        return null;
      }
      return prediction;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Local-model invoke failed for user ${userId}: ${message}`,
      );
      return null;
    }
  }

  /**
   * Shadow-mode evaluation: predicts in the background and logs how the local
   * model would have answered versus the LLM, without changing what the user
   * sees. Safe to call from the LLM path; returns the prediction (or null) for
   * any caller that wants to record agreement itself.
   */
  async compareInShadowMode(
    userId: string,
    thread: LocalModelThreadInput,
    llm: { category?: string | null; priorityBand?: string | null },
  ): Promise<LocalModelPrediction | null> {
    if (!this.shadowEnabled || !this.functionName) {
      return null;
    }
    const prediction = await this.predict(userId, thread);
    if (!prediction) {
      return null;
    }
    const llmFamily = llm.category != null ? assignFamily(llm.category) : null;
    this.logger.log(
      JSON.stringify({
        event: "local_model_shadow",
        userId,
        threadId: thread.threadId,
        family: prediction.family,
        familyFallback: prediction.familyFallback,
        llmFamily,
        familyAgree: llmFamily != null && prediction.family === llmFamily,
        localCategory: prediction.category,
        llmCategory: llm.category ?? null,
        categoryAgree:
          llm.category != null && prediction.category === llm.category,
        categoryFallback: prediction.categoryFallback,
        localPriority: prediction.priorityBand,
        llmPriority: llm.priorityBand ?? null,
        priorityAgree:
          llm.priorityBand != null &&
          prediction.priorityBand === llm.priorityBand,
        priorityFallback: prediction.priorityFallback,
      }),
    );
    return prediction;
  }

  /**
   * Convenience wrapper for the priority pipeline: builds the model input from
   * an Email and the LLM's category/score, then runs the shadow comparison.
   * Keeps the train/serve payload construction here (next to the model) rather
   * than in the caller.
   */
  async shadowCompareEmail(
    userId: string,
    email: Email,
    llmCategory: string | null,
    priorityScore: number,
  ): Promise<void> {
    if (!this.shadowEnabled) {
      return;
    }
    const llmPriorityBand = priorityBand(priorityScore);
    const prediction = await this.compareInShadowMode(
      userId,
      buildLocalModelInput(email),
      { category: llmCategory, priorityBand: llmPriorityBand },
    );
    if (prediction && email.emailThreadId) {
      await this.persistDebugSnapshot(
        email.emailThreadId,
        prediction,
        llmCategory,
        llmPriorityBand,
      );
    }
  }

  /**
   * Persists the local-vs-LLM comparison on the thread for the category debug
   * UI. `decidedBy` is "llm" in shadow mode (the LLM remains authoritative);
   * once live it will be "local" for confident predictions. Errors are
   * swallowed — a debug write must never affect processing.
   */
  private async persistDebugSnapshot(
    emailThreadId: string,
    prediction: LocalModelPrediction,
    llmCategory: string | null,
    llmPriorityBand: string,
  ): Promise<void> {
    const llmFamily = llmCategory != null ? assignFamily(llmCategory) : null;
    const snapshot: LocalModelDebugSnapshot = {
      evaluatedAt: new Date().toISOString(),
      decidedBy: "llm",
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
      llmCategory,
      llmPriorityBand,
      categoryAgree: llmCategory != null && prediction.category === llmCategory,
      priorityAgree: prediction.priorityBand === llmPriorityBand,
      llmFamily,
      familyAgree: llmFamily != null && prediction.family === llmFamily,
    };
    try {
      await this.emailThreadRepository.update(
        { id: emailThreadId },
        { localModelDebug: snapshot },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to persist local-model debug for thread ${emailThreadId}: ${message}`,
      );
    }
  }
}
