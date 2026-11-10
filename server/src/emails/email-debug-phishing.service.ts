import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { Email } from "../database/entities/email.entity";
import {
  detectDisplayNameDomainMismatch,
  DisplayNameDomainCheck,
  extractPhishingSignals,
  PhishingSignals,
} from "../summarization/phishing-detection.service";

export interface PhishingDebugInfo {
  emailId: string;
  /** Sender email address (decrypted) */
  from: string | null;
  /** Sender display name (decrypted) */
  fromName: string | null;
  /** The phishing verdict stored on the email after LLM analysis */
  stored: {
    confidence: "low" | "medium" | "high" | null;
    reason: string | null;
  };
  /**
   * The keyword/domain signals recomputed from the email, mirroring what the LLM
   * is fed during summarisation. An all-empty result explains why the LLM had no
   * phishing hints to act on.
   */
  signals: PhishingSignals;
  /**
   * Coarse display-name vs sender-domain comparison. Production uses the brand
   * registry instead (signals.redFlags / signals.deterministicVerdict).
   */
  displayNameCheck: DisplayNameDomainCheck;
}

/**
 * Admin-only debug helper: answers "why was (or wasn't) this email flagged as
 * phishing?" by returning the stored LLM verdict alongside the raw signals that
 * fed it, plus a coarse display-name/domain comparison for spotting senders the
 * brand registry does not cover yet.
 *
 * Gated by AdminGuard at the controller, so we deliberately do not scope by userId.
 */
@Injectable()
export class EmailDebugPhishingService {
  constructor(
    @InjectRepository(Email)
    private readonly emailRepository: Repository<Email>,
  ) {}

  async getPhishingDebugInfo(emailId: string): Promise<PhishingDebugInfo> {
    const email = await this.emailRepository.findOne({
      where: { id: emailId },
    });

    if (!email) {
      throw new NotFoundException(`Email ${emailId} not found`);
    }

    const signals = extractPhishingSignals(
      email.from ?? undefined,
      email.body ?? "",
      {
        fromName: email.fromName,
        replyTo: email.replyTo,
        subject: email.subject,
        htmlBody: email.htmlBody,
        senderAuthResults: email.senderAuthResults,
      },
    );
    const displayNameCheck = detectDisplayNameDomainMismatch(
      email.fromName,
      signals.senderDomain,
    );

    return {
      emailId: email.id,
      from: email.from ?? null,
      fromName: email.fromName ?? null,
      stored: {
        confidence: email.phishingConfidence,
        reason: email.phishingReason,
      },
      signals,
      displayNameCheck,
    };
  }
}
