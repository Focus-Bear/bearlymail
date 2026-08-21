import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { LocalModelSupervision } from "../database/entities/local-model-supervision.entity";
import { EncryptionHelper } from "../encryption/encryption.helper";
import {
  SUPERVISION_ACCURACY_THRESHOLD,
  SUPERVISION_DEFAULT_RATE,
  SUPERVISION_DISABLED_FLAG,
  SUPERVISION_ENABLED_ENV,
  SUPERVISION_RATE_STAGES,
  SUPERVISION_WINDOW_SIZE,
} from "./local-model-supervision.constants";

/**
 * Computes the next supervision rate from a completed window's accuracy.
 *
 * Pure + exported for testing. Snaps the current rate to the nearest stage,
 * then steps DOWN one stage when the category is accurate enough
 * (≥ threshold) or UP one stage when it regressed. Clamped to the stage ends.
 */
export function nextSupervisionRate(
  currentRate: number,
  agreements: number,
  samples: number,
): number {
  const stages = SUPERVISION_RATE_STAGES;
  // Snap to the nearest known stage so an out-of-band rate (e.g. a manual
  // override) still lands on the ladder.
  let stageIndex = 0;
  let bestDistance = Infinity;
  stages.forEach((rate, index) => {
    const distance = Math.abs(rate - currentRate);
    if (distance < bestDistance) {
      bestDistance = distance;
      stageIndex = index;
    }
  });

  const accuracy = samples > 0 ? agreements / samples : 0;
  const nextIndex =
    accuracy >= SUPERVISION_ACCURACY_THRESHOLD
      ? Math.min(stageIndex + 1, stages.length - 1)
      : Math.max(stageIndex - 1, 0);
  return stages[nextIndex];
}

/**
 * Adaptive per-category supervision state for the local model. See
 * local-model-supervision.constants.ts for the rationale.
 */
@Injectable()
export class LocalModelSupervisionService {
  private readonly logger = new Logger(LocalModelSupervisionService.name);
  private readonly enabled: boolean;

  constructor(
    @InjectRepository(LocalModelSupervision)
    private readonly supervisionRepository: Repository<LocalModelSupervision>,
    private readonly configService: ConfigService,
  ) {
    // ON by default; only an explicit "false" disables it (legacy 0% behaviour).
    this.enabled =
      this.configService.get<string>(SUPERVISION_ENABLED_ENV) !==
      SUPERVISION_DISABLED_FLAG;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * The share (percent) of this category's confident predictions to divert to
   * the LLM for scoring. Returns the category's current adaptive rate, the
   * default for a category we've never supervised, or 0 when disabled.
   */
  async getSampleRatePercent(
    userId: string,
    category: string,
  ): Promise<number> {
    if (!this.enabled || !category) {
      return 0;
    }
    const categoryHash = EncryptionHelper.hashCategory(category);
    const row = await this.supervisionRepository.findOne({
      where: { userId, categoryHash },
      select: { sampleRatePercent: true },
    });
    return row?.sampleRatePercent ?? SUPERVISION_DEFAULT_RATE;
  }

  /**
   * Records one supervised decision (a diverted, confident prediction compared
   * against the LLM) for a category and, when the window completes, adapts the
   * rate. Atomic per category via a row-locked transaction. Never throws — a
   * measurement failure must not break the priority pipeline.
   */
  async recordSample(
    userId: string,
    category: string,
    agreed: boolean,
  ): Promise<void> {
    if (!this.enabled || !category) {
      return;
    }
    const categoryHash = EncryptionHelper.hashCategory(category);
    try {
      await this.supervisionRepository.manager.transaction(async (tx) => {
        const repo = tx.getRepository(LocalModelSupervision);
        const existing = await repo.findOne({
          where: { userId, categoryHash },
          lock: { mode: "pessimistic_write" },
        });

        if (!existing) {
          await repo.insert({
            userId,
            categoryHash,
            category,
            sampleRatePercent: SUPERVISION_DEFAULT_RATE,
            windowSamples: 1,
            windowAgreements: agreed ? 1 : 0,
          });
          return;
        }

        const windowSamples = existing.windowSamples + 1;
        const windowAgreements = existing.windowAgreements + (agreed ? 1 : 0);

        if (windowSamples < SUPERVISION_WINDOW_SIZE) {
          await repo.update(existing.id, { windowSamples, windowAgreements });
          return;
        }

        // Window complete — adapt the rate and start a fresh window.
        const newRate = nextSupervisionRate(
          existing.sampleRatePercent,
          windowAgreements,
          windowSamples,
        );
        await repo.update(existing.id, {
          sampleRatePercent: newRate,
          windowSamples: 0,
          windowAgreements: 0,
        });
        this.logger.log(
          JSON.stringify({
            event: "local_model_supervision_window",
            userId,
            categoryHash,
            accuracy: windowAgreements / windowSamples,
            previousRate: existing.sampleRatePercent,
            newRate,
            windowSize: windowSamples,
          }),
        );
      });
    } catch (error) {
      this.logger.warn(
        `Failed to record supervision sample for category hash ${categoryHash}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
