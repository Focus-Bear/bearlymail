import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import * as crypto from "crypto";
import { MoreThan, Repository } from "typeorm";

import { AutoResponseSuppression } from "../database/entities/auto-response-suppression.entity";
import { SuppressionReason } from "./types/auto-responder.types";

/**
 * Service for managing auto-response suppressions (cooldowns and opt-outs)
 */
@Injectable()
export class AutoResponderSuppressionService {
  private readonly logger = new Logger(AutoResponderSuppressionService.name);

  constructor(
    @InjectRepository(AutoResponseSuppression)
    private autoResponseSuppressionRepository: Repository<AutoResponseSuppression>,
  ) {}

  /**
   * Hash an email address for storage/lookup
   */
  hashEmail(email: string): string {
    return crypto
      .createHash("sha256")
      .update(email.toLowerCase().trim())
      .digest("hex");
  }

  /**
   * Check if sender is suppressed
   */
  async checkSuppression(
    userId: string,
    senderEmailHash: string,
  ): Promise<AutoResponseSuppression | null> {
    const now = new Date();

    // Check for permanent suppression (opt-out)
    const permanentSuppression =
      await this.autoResponseSuppressionRepository.findOne({
        where: {
          userId,
          senderEmailHash,
          reason: SuppressionReason.OPT_OUT,
        },
      });
    if (permanentSuppression) {
      return permanentSuppression;
    }

    // Check for active cooldown
    const cooldownSuppression =
      await this.autoResponseSuppressionRepository.findOne({
        where: {
          userId,
          senderEmailHash,
          reason: SuppressionReason.COOLDOWN,
          suppressUntil: MoreThan(now),
        },
      });

    return cooldownSuppression;
  }

  /**
   * Add cooldown suppression for a sender
   */
  async addCooldownSuppression(
    userId: string,
    senderEmailHash: string,
    cooldownDays: number,
  ): Promise<void> {
    const suppressUntil = new Date();
    suppressUntil.setDate(suppressUntil.getDate() + cooldownDays);

    // Remove existing cooldown for this sender
    await this.autoResponseSuppressionRepository.delete({
      userId,
      senderEmailHash,
      reason: SuppressionReason.COOLDOWN,
    });

    // Add new cooldown
    await this.autoResponseSuppressionRepository.save({
      userId,
      senderEmailHash,
      reason: SuppressionReason.COOLDOWN,
      suppressUntil,
      notes: `Auto-response cooldown for ${cooldownDays} days`,
    });
  }

  /**
   * Add opt-out suppression for a sender
   */
  async addOptOutSuppression(
    userId: string,
    senderEmail: string,
    notes?: string,
  ): Promise<void> {
    const senderEmailHash = this.hashEmail(senderEmail);

    // Remove any existing suppressions for this sender
    await this.autoResponseSuppressionRepository.delete({
      userId,
      senderEmailHash,
    });

    // Add permanent opt-out
    await this.autoResponseSuppressionRepository.save({
      userId,
      senderEmailHash,
      reason: SuppressionReason.OPT_OUT,
      // Permanent
      suppressUntil: null,
      notes: notes || "User requested opt-out",
    });
  }

  /**
   * Remove opt-out suppression for a sender
   */
  async removeOptOutSuppression(
    userId: string,
    senderEmail: string,
  ): Promise<void> {
    const senderEmailHash = this.hashEmail(senderEmail);
    await this.autoResponseSuppressionRepository.delete({
      userId,
      senderEmailHash,
      reason: SuppressionReason.OPT_OUT,
    });
  }
}
