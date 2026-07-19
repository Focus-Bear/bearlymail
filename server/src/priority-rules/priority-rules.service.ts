import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { CloudWatchService } from "../aws/cloudwatch.service";
import type { EmailMetadata } from "../category-rules/category-rules.types";
import { specToV2 } from "../category-rules/category-rules-auto-composite.helper";
import { BODY_PREVIEW_LENGTHS } from "../constants/llm-constants";
import {
  bandToRepresentativeScore,
  PRIORITY_BANDS,
  PriorityBand,
  scoreToBand,
} from "../constants/priority-band";
import {
  PRIORITY_RULE_GATES,
  PRIORITY_RULE_SOURCE,
} from "../constants/priority-rule.constants";
import type { CompositeCategoryRuleSpecV3 } from "../database/entities/category-rule.entity";
import { Email } from "../database/entities/email.entity";
import { PriorityRule } from "../database/entities/priority-rule.entity";
import { buildRuleMatchText } from "../llm/email-content-cleaner";
import type {
  PriorityRuleDto,
  PriorityRuleMatch,
  UpsertPriorityRuleInput,
} from "./priority-rules.types";
import {
  computeBandConsistency,
  qualifiesForRule,
  shouldRetireForDrift,
} from "./priority-rules-consistency.helper";
import { evaluatePriorityRule } from "./priority-rules-match.helper";

/** Outcome of a mining attempt, for logging/telemetry. */
export type MineOutcome =
  | { status: "skipped"; reason: string }
  | { status: "created" | "updated"; band: PriorityBand; sampleCount: number };

/**
 * Evaluates and mines deterministic priority rules. Matching mirrors the
 * category rule matcher but via the priority-specific `evaluatePriorityRule`
 * (sender-anchored, content optional). Mining learns a rule from the LLM's own
 * scores once a sender's threads cluster tightly into one band.
 */
@Injectable()
export class PriorityRulesService {
  private readonly logger = new Logger(PriorityRulesService.name);

  constructor(
    @InjectRepository(PriorityRule)
    private readonly priorityRuleRepository: Repository<PriorityRule>,
    @InjectRepository(Email)
    private readonly emailRepository: Repository<Email>,
    private readonly cloudWatchService: CloudWatchService,
  ) {}

  /** Same sender normalisation as CategoryRulesService, for matching parity. */
  private normaliseSender(from: string): string {
    const match = from.match(/<([^>]+)>/) || from.match(/([^\s]+@[^\s]+)/);
    return (match ? match[1] : from).toLowerCase().trim();
  }

  /**
   * The enabled rules in evaluation order, for batch callers that match many
   * emails from one fetch (pass the result as `peekMatchingRule`'s
   * `preloadedRules`).
   */
  async loadEnabledRules(userId: string): Promise<PriorityRule[]> {
    return this.priorityRuleRepository.find({
      where: { userId, isEnabled: true },
      order: { createdAt: "ASC" },
    });
  }

  /**
   * Returns the first enabled priority rule matching the email (rules evaluated
   * oldest-first for stable precedence), or null. Does NOT record a hit — use
   * for shadow comparison / debug where matching must not mutate state.
   */
  async peekMatchingRule(
    userId: string,
    email: EmailMetadata,
    preloadedRules?: PriorityRule[],
  ): Promise<PriorityRuleMatch | null> {
    const rules = preloadedRules ?? (await this.loadEnabledRules(userId));

    for (const rule of rules) {
      const matches = evaluatePriorityRule(rule.compositeSpec, email, (raw) =>
        this.normaliseSender(raw),
      );
      if (matches) {
        return {
          ruleId: rule.id,
          band: rule.band,
          representativeScore: rule.representativeScore,
        };
      }
    }
    return null;
  }

  /**
   * Like `peekMatchingRule`, but records a hit on the winning rule. Use on the
   * live apply path where a match drives the persisted priority.
   */
  async findMatchingRule(
    userId: string,
    email: EmailMetadata,
  ): Promise<PriorityRuleMatch | null> {
    const match = await this.peekMatchingRule(userId, email);
    if (match) {
      await this.priorityRuleRepository.increment(
        { id: match.ruleId },
        "hitCount",
        1,
      );
    }
    return match;
  }

  /** Records a hit on a rule that drove a deterministic skip. */
  async recordHit(ruleId: string): Promise<void> {
    await this.priorityRuleRepository.increment({ id: ruleId }, "hitCount", 1);
  }

  /** Inspect-friendly list of a user's priority rules (admin/debug surface). */
  async listRules(userId: string): Promise<PriorityRuleDto[]> {
    const rules = await this.priorityRuleRepository.find({
      where: { userId },
      order: { hitCount: "DESC", createdAt: "DESC" },
    });
    return rules.map((rule) => this.toDto(rule));
  }

  /** Enables or disables a rule (manual override from the settings surface). */
  async setEnabled(
    userId: string,
    ruleId: string,
    isEnabled: boolean,
  ): Promise<boolean> {
    const result = await this.priorityRuleRepository.update(
      { id: ruleId, userId },
      { isEnabled },
    );
    return (result.affected ?? 0) > 0;
  }

  /** Creates a user-managed priority rule (source='user'; the miner won't touch it). */
  async createRule(
    userId: string,
    input: UpsertPriorityRuleInput,
  ): Promise<PriorityRuleDto> {
    const band = this.requireBand(input.band);
    const spec = this.buildUserSpec(input);
    if (spec.fromMatchesAny.length === 0) {
      throw new BadRequestException("At least one sender is required.");
    }
    const created = this.priorityRuleRepository.create({
      userId,
      compositeSpec: spec,
      band,
      representativeScore: bandToRepresentativeScore(band),
      source: PRIORITY_RULE_SOURCE.USER,
      sampleCount: 0,
      dominantBandShare: 0,
      isEnabled: input.isEnabled ?? true,
      hitCount: 0,
      lastValidatedAt: null,
    });
    const saved = await this.priorityRuleRepository.save(created);
    return this.toDto(saved);
  }

  /**
   * Updates a rule. Editing the band or spec marks it source='user' so the miner
   * stops managing it; toggling isEnabled alone keeps the existing source.
   * Returns the updated DTO, or null when the rule doesn't exist for the user.
   */
  async updateRule(
    userId: string,
    ruleId: string,
    input: UpsertPriorityRuleInput,
  ): Promise<PriorityRuleDto | null> {
    const rule = await this.priorityRuleRepository.findOne({
      where: { id: ruleId, userId },
    });
    if (!rule) return null;

    const patch: Partial<PriorityRule> = {};
    const editsSpec =
      input.senders !== undefined ||
      input.subjectContainsAny !== undefined ||
      input.bodyContainsAny !== undefined;

    if (input.band !== undefined) {
      const band = this.requireBand(input.band);
      patch.band = band;
      patch.representativeScore = bandToRepresentativeScore(band);
    }
    if (editsSpec) {
      const existing = specToV2(rule.compositeSpec);
      const spec = this.buildUserSpec({
        senders: input.senders ?? existing.senderMatchesAny,
        subjectContainsAny:
          input.subjectContainsAny ?? existing.subjectContainsAny,
        bodyContainsAny: input.bodyContainsAny ?? existing.bodyContainsAny,
      });
      if (spec.fromMatchesAny.length === 0) {
        throw new BadRequestException("At least one sender is required.");
      }
      patch.compositeSpec = spec;
    }
    if (input.band !== undefined || editsSpec) {
      patch.source = PRIORITY_RULE_SOURCE.USER;
    }
    if (input.isEnabled !== undefined) {
      patch.isEnabled = input.isEnabled;
    }

    if (Object.keys(patch).length > 0) {
      await this.priorityRuleRepository.update({ id: ruleId, userId }, patch);
    }
    const updated = await this.priorityRuleRepository.findOne({
      where: { id: ruleId, userId },
    });
    return updated ? this.toDto(updated) : null;
  }

  /** Deletes a rule. Returns false when it doesn't exist for the user. */
  async deleteRule(userId: string, ruleId: string): Promise<boolean> {
    const result = await this.priorityRuleRepository.delete({
      id: ruleId,
      userId,
    });
    return (result.affected ?? 0) > 0;
  }

  private requireBand(band: PriorityBand | undefined): PriorityBand {
    if (!band || !PRIORITY_BANDS.includes(band)) {
      throw new BadRequestException(`Invalid priority band: ${band}`);
    }
    return band;
  }

  private buildUserSpec(
    input: Pick<
      UpsertPriorityRuleInput,
      "senders" | "subjectContainsAny" | "bodyContainsAny"
    >,
  ): CompositeCategoryRuleSpecV3 {
    const clean = (values?: string[]): string[] =>
      (values ?? []).map((value) => value.trim()).filter(Boolean);
    return {
      v: 3,
      fromMatchesAny: clean(input.senders),
      subjectContainsAny: clean(input.subjectContainsAny),
      bodyContainsAny: clean(input.bodyContainsAny),
    };
  }

  private toDto(rule: PriorityRule): PriorityRuleDto {
    const spec = specToV2(rule.compositeSpec);
    const senders = spec.senderMatchesAny ?? [];
    return {
      id: rule.id,
      sender: senders[0] ?? "",
      senders,
      subjectContainsAny: spec.subjectContainsAny ?? [],
      bodyContainsAny: spec.bodyContainsAny ?? [],
      band: rule.band,
      representativeScore: rule.representativeScore,
      source: rule.source,
      sampleCount: rule.sampleCount,
      dominantBandShare: rule.dominantBandShare,
      hitCount: rule.hitCount,
      shadowSampleCount: rule.shadowSampleCount,
      shadowDivergenceCount: rule.shadowDivergenceCount,
      divergenceRate:
        rule.shadowSampleCount > 0
          ? rule.shadowDivergenceCount / rule.shadowSampleCount
          : null,
      isEnabled: rule.isEnabled,
      lastValidatedAt: rule.lastValidatedAt,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
    };
  }

  /**
   * Phase-1 entry point called after every LLM priority refinement. Compares
   * what an existing rule WOULD have said against the LLM's score (shadow
   * telemetry — never skips the LLM yet), then attempts to mine/refresh a rule
   * for the sender. Never throws: rule work must not block email processing.
   */
  async shadowAndMine(
    userId: string,
    email: Email,
    llmScore: number,
    workerId: string,
  ): Promise<void> {
    if (!email.emailThreadId || !email.senderEmailHmac) {
      return;
    }
    try {
      const emailMetadata = this.buildEmailMetadata(email);
      await this.recordShadowDivergence(
        userId,
        emailMetadata,
        llmScore,
        workerId,
      );
      await this.mineAndUpsertRule(userId, email, emailMetadata, workerId);
    } catch (error) {
      this.logger.error(
        `[Worker ${workerId}] Priority-rule shadow/mine failed for email ${email.id}`,
        error,
      );
    }
  }

  private buildEmailMetadata(email: Email): EmailMetadata {
    return {
      from: email.from || "",
      subject: email.subject || "",
      bodyTextForMatch: buildRuleMatchText(
        email.body || "",
        email.htmlBody,
        BODY_PREVIEW_LENGTHS.RULE_MATCH,
      ),
    };
  }

  /**
   * Logs whether an existing rule's band agrees with the LLM's band for this
   * email. This is the Phase-1 risk telemetry: we want low divergence before we
   * ever let a rule skip the LLM. No-op when no rule matches.
   */
  private async recordShadowDivergence(
    userId: string,
    emailMetadata: EmailMetadata,
    llmScore: number,
    workerId: string,
  ): Promise<void> {
    const match = await this.peekMatchingRule(userId, emailMetadata);
    if (!match) return;

    const llmBand = scoreToBand(llmScore);
    const diverged = match.band !== llmBand;
    if (diverged) {
      this.logger.warn(
        `[Worker ${workerId}] Priority-rule shadow DIVERGE: rule ${match.ruleId} band=${match.band} vs llmBand=${llmBand} (llmScore=${llmScore})`,
      );
    } else {
      this.logger.debug(
        `[Worker ${workerId}] Priority-rule shadow AGREE: rule ${match.ruleId} band=${match.band} (llmScore=${llmScore})`,
      );
    }

    await this.cloudWatchService.putMetric("PriorityRuleShadowSample", 1);
    if (diverged) {
      await this.cloudWatchService.putMetric("PriorityRuleShadowDiverge", 1);
    }

    await this.priorityRuleRepository.increment(
      { id: match.ruleId },
      "shadowSampleCount",
      1,
    );
    if (diverged) {
      await this.priorityRuleRepository.increment(
        { id: match.ruleId },
        "shadowDivergenceCount",
        1,
      );
    }
    await this.maybeRetireForDrift(match.ruleId, workerId);
  }

  /** Disables a rule that has drifted too far from the LLM (Phase-3 retirement). */
  private async maybeRetireForDrift(
    ruleId: string,
    workerId: string,
  ): Promise<void> {
    const rule = await this.priorityRuleRepository.findOne({
      where: { id: ruleId },
    });
    if (
      !rule ||
      !rule.isEnabled ||
      rule.source === PRIORITY_RULE_SOURCE.USER ||
      !shouldRetireForDrift(rule.shadowSampleCount, rule.shadowDivergenceCount)
    ) {
      return;
    }
    await this.priorityRuleRepository.update(
      { id: ruleId },
      { isEnabled: false },
    );
    this.logger.warn(
      `[Worker ${workerId}] Retired priority rule ${ruleId} for drift (${rule.shadowDivergenceCount}/${rule.shadowSampleCount} diverged)`,
    );
  }

  /**
   * Gathers the sender's LLM-labelled thread scores, and when they clear the
   * consistency gates, creates or refreshes a sender-anchored priority rule.
   * Returns the outcome for logging.
   */
  async mineAndUpsertRule(
    userId: string,
    email: Email,
    emailMetadata: EmailMetadata,
    workerId: string,
  ): Promise<MineOutcome> {
    const scores = await this.gatherSenderScores(
      userId,
      email.senderEmailHmac as string,
    );
    const consistency = computeBandConsistency(scores);
    if (!qualifiesForRule(consistency) || consistency.dominantBand === null) {
      // A sender that USED to be consistent (enough samples) but no longer
      // clears the dominant-band gate has drifted — retire any rule it has.
      if (consistency.sampleCount >= PRIORITY_RULE_GATES.MIN_SAMPLES) {
        await this.retireSenderRuleForInconsistency(
          userId,
          this.normaliseSender(emailMetadata.from),
          workerId,
        );
      }
      return {
        status: "skipped",
        reason: `n=${consistency.sampleCount} share=${consistency.dominantShare.toFixed(2)}`,
      };
    }

    const sender = this.normaliseSender(emailMetadata.from);
    if (!sender) {
      return { status: "skipped", reason: "no-sender" };
    }
    const outcome = await this.upsertSenderRule(userId, sender, consistency);
    this.logger.log(
      `[Worker ${workerId}] Priority rule ${outcome.status} for sender (band=${consistency.dominantBand}, n=${consistency.sampleCount}, share=${consistency.dominantShare.toFixed(2)})`,
    );
    return outcome;
  }

  /**
   * Distinct LLM-derived priorityScores across the sender's threads. Excludes
   * threads last scored by a rule (`prioritySource = 'rule'`) or the local model
   * (`'local'`) so neither can reinforce itself through mined rules.
   */
  private async gatherSenderScores(
    userId: string,
    senderEmailHmac: string,
  ): Promise<number[]> {
    const rows = await this.emailRepository
      .createQueryBuilder("email")
      .innerJoin("email_threads", "thread", "thread.id = email.emailThreadId")
      .select("thread.id", "threadId")
      .addSelect("thread.priorityScore", "score")
      .where("email.userId = :userId", { userId })
      .andWhere("email.senderEmailHmac = :hmac", { hmac: senderEmailHmac })
      .andWhere("thread.priorityScore IS NOT NULL")
      .andWhere(
        "(thread.prioritySource IS NULL OR thread.prioritySource NOT IN ('rule', 'local'))",
      )
      .distinct(true)
      .getRawMany<{ threadId: string; score: number | string }>();

    return rows.map((row) => Number(row.score));
  }

  private async upsertSenderRule(
    userId: string,
    sender: string,
    consistency: {
      dominantBand: PriorityBand;
      sampleCount: number;
      dominantShare: number;
    },
  ): Promise<MineOutcome> {
    const band = consistency.dominantBand;
    const representativeScore = bandToRepresentativeScore(band);
    const spec: CompositeCategoryRuleSpecV3 = {
      v: 3,
      fromMatchesAny: [sender],
      subjectContainsAny: [],
      bodyContainsAny: [],
    };

    const existing = await this.findRuleForSender(userId, sender);
    const now = new Date();
    if (existing) {
      // A user-managed rule for this sender already exists: leave it alone (do
      // NOT overwrite it, and do NOT create a parallel mined duplicate).
      if (existing.source === PRIORITY_RULE_SOURCE.USER) {
        return { status: "skipped", reason: "user-managed" };
      }
      await this.priorityRuleRepository.update(
        { id: existing.id },
        {
          compositeSpec: spec,
          band,
          representativeScore,
          sampleCount: consistency.sampleCount,
          dominantBandShare: consistency.dominantShare,
          isEnabled: existing.isEnabled,
          lastValidatedAt: now,
        },
      );
      return { status: "updated", band, sampleCount: consistency.sampleCount };
    }

    const created = this.priorityRuleRepository.create({
      userId,
      compositeSpec: spec,
      band,
      representativeScore,
      sampleCount: consistency.sampleCount,
      dominantBandShare: consistency.dominantShare,
      isEnabled: true,
      hitCount: 0,
      lastValidatedAt: now,
    });
    await this.priorityRuleRepository.save(created);
    return { status: "created", band, sampleCount: consistency.sampleCount };
  }

  /**
   * Finds an existing priority rule for a normalised sender by decrypting each
   * of the user's rule specs in memory (specs are encrypted, so this can't be a
   * WHERE clause). A user has few priority rules, so this is cheap.
   *
   * Only matches generic sender-only rules — rules with subject/body constraints
   * or exclusions are left alone so mining cannot silently overwrite a more
   * specific rule with a sender-wildcard one.
   *
   * Returns user-managed rules too, so the miner can detect them and skip
   * (rather than creating a parallel mined duplicate). Callers decide what to do
   * based on `source`.
   */
  private async findRuleForSender(
    userId: string,
    normalisedSender: string,
  ): Promise<PriorityRule | null> {
    const rules = await this.priorityRuleRepository.find({ where: { userId } });
    return (
      rules.find((rule) => {
        const v2 = specToV2(rule.compositeSpec);
        const senderMatches = v2.senderMatchesAny ?? [];
        const isGenericSenderOnly =
          (v2.subjectContainsAny ?? []).length === 0 &&
          (v2.bodyContainsAny ?? []).length === 0 &&
          (v2.subjectNotContainsAny ?? []).length === 0 &&
          (v2.bodyNotContainsAny ?? []).length === 0;
        return (
          isGenericSenderOnly &&
          senderMatches.some(
            (pattern) => this.normaliseSender(pattern) === normalisedSender,
          )
        );
      }) ?? null
    );
  }

  /** Disables a sender's enabled rule after the sender's scores lost consistency. */
  private async retireSenderRuleForInconsistency(
    userId: string,
    sender: string,
    workerId: string,
  ): Promise<void> {
    if (!sender) return;
    const existing = await this.findRuleForSender(userId, sender);
    if (!existing || !existing.isEnabled) return;
    // Never auto-disable a user-managed rule on drift — the user owns it.
    if (existing.source === PRIORITY_RULE_SOURCE.USER) return;
    await this.priorityRuleRepository.update(
      { id: existing.id },
      { isEnabled: false },
    );
    this.logger.warn(
      `[Worker ${workerId}] Retired priority rule ${existing.id} — sender scores no longer cluster in one band`,
    );
  }
}
