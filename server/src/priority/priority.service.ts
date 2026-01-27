import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import {
  UserContext,
  ContextKey,
} from "../database/entities/user-context.entity";
import {
  PriorityOverride,
  OverrideReasonType,
} from "../database/entities/priority-override.entity";
import { LLMService } from "../llm/llm.service";
import * as natural from "natural";
import { calculateScoreFromBreakdown } from "../utils/priority.utils";
import {
  PRIORITY_SCORES,
  PRIORITY_BOOSTS,
  PRIORITY_WEIGHTS,
  SENTIMENT_THRESHOLDS,
  JOB_TITLE_SCORES,
  PRIORITY_FACTOR_TYPES,
  PRIORITY_FACTOR_DISPLAY_NAMES,
  SENTIMENT_TYPES,
} from "../constants/priority-constants";

/**
 * Priority explanation structure
 */
export interface PriorityExplanation {
  score: number;
  factors: Array<{
    type: string;
    description: string;
    contribution: number;
  }>;
  breakdown?: Array<{
    factor: string;
    value: number;
    description: string;
  }>;
  dimensions?: {
    urgency: { score: number; reasons: string[] };
    goalAlignment: { score: number; reasons: string[] };
    vipContact: { score: number; reasons: string[] };
    sentiment: { score: number; type: string; reasons: string[] };
  };
}

@Injectable()
export class PriorityService {
  private readonly logger = new Logger(PriorityService.name);

  constructor(
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    @InjectRepository(EmailThread)
    private emailThreadRepository: Repository<EmailThread>,
    @InjectRepository(UserContext)
    private userContextRepository: Repository<UserContext>,
    @InjectRepository(PriorityOverride)
    private priorityOverrideRepository: Repository<PriorityOverride>,
    private llmService: LLMService,
  ) {}

  /**
   * Calculate priority score with explanations
   */
  // eslint-disable-next-line max-lines-per-function, complexity, max-statements
  calculatePriorityWithExplanation(
    email: Partial<Email>,
    contexts: UserContext[],
    daysSinceLastEmail?: number,
  ): PriorityExplanation {
    let baseScore = 0;
    const factors: Array<{
      type: string;
      description: string;
      contribution: number;
    }> = [];

    // VIP Contact boost
    const vipContacts = contexts.filter(
      (c) => c.contextKey === ContextKey.VIP_CONTACT,
    );
    const matchingVip = vipContacts.find(
      (vip) =>
        email.from?.toLowerCase().includes(vip.contextValue.toLowerCase()) ||
        email.fromName?.toLowerCase().includes(vip.contextValue.toLowerCase()),
    );
    if (matchingVip) {
      baseScore += PRIORITY_BOOSTS.VIP_CONTACT;
      factors.push({
        type: PRIORITY_FACTOR_TYPES.VIP_CONTACT,
        description: `From VIP contact: ${matchingVip.contextValue}`,
        contribution: PRIORITY_BOOSTS.VIP_CONTACT,
      });
    }

    // Goal alignment - PRIMARY FACTOR (40% weight)
    // Calculate explicit goal alignment score (0-100)
    const goals = contexts.filter((c) => c.contextKey === ContextKey.MY_GOALS);
    const emailText =
      `${email.subject || ""} ${email.body || ""}`.toLowerCase();
    const matchingGoals: string[] = [];
    let goalAlignmentScore = 0;

    if (goals.length > 0) {
      for (const goal of goals) {
        const keywords = goal.contextValue
          .toLowerCase()
          .split(/[,;]/)
          .map((k) => k.trim())
          .filter(Boolean);
        if (keywords.some((keyword) => emailText.includes(keyword))) {
          matchingGoals.push(goal.contextValue);
        }
      }
      // Calculate goal alignment as percentage (0-100)
      goalAlignmentScore =
        goals.length > 0
          ? Math.min(
              100,
              Math.round((matchingGoals.length / goals.length) * 100),
            )
          : 0;
    }

    // Apply weight to goal alignment
    const goalAlignmentContribution = Math.round(
      goalAlignmentScore * PRIORITY_WEIGHTS.GOAL_ALIGNMENT,
    );
    if (goalAlignmentContribution > 0) {
      baseScore += goalAlignmentContribution;
      factors.push({
        type: PRIORITY_FACTOR_TYPES.GOAL_ALIGNMENT,
        description:
          matchingGoals.length > 0
            ? `Aligned with goals: ${matchingGoals.join(", ")}`
            : "No goal alignment",
        contribution: goalAlignmentContribution,
      });
    }

    // Working on / Current projects boost (weighted by priority)
    const workingOn = contexts.filter(
      (c) => c.contextKey === ContextKey.WORKING_ON,
    );
    for (const project of workingOn) {
      const keywords = project.contextValue
        .toLowerCase()
        .split(/[,;]/)
        .map((k) => k.trim())
        .filter(Boolean);
      if (keywords.some((keyword) => emailText.includes(keyword))) {
        // Priority 1 = +15, Priority 2 = +10, Priority 3 = +5
        let priorityBoost: number;
        if (project.priority === 1) {
          priorityBoost = PRIORITY_BOOSTS.PROJECT_PRIORITY_1;
        } else if (project.priority === 2) {
          priorityBoost = PRIORITY_BOOSTS.PROJECT_PRIORITY_2;
        } else {
          priorityBoost = PRIORITY_BOOSTS.PROJECT_PRIORITY_3;
        }
        baseScore += priorityBoost;
        factors.push({
          type: PRIORITY_FACTOR_TYPES.CURRENT_PROJECT,
          description: `Related to current work: ${project.contextValue}`,
          contribution: priorityBoost,
        });
        break;
        // Only count one project match
      }
    }

    // Don't care penalty
    const dontCare = contexts.filter(
      (c) => c.contextKey === ContextKey.DONT_CARE,
    );
    for (const item of dontCare) {
      const keywords = item.contextValue
        .toLowerCase()
        .split(/[,;]/)
        .map((k) => k.trim())
        .filter(Boolean);
      if (keywords.some((keyword) => emailText.includes(keyword))) {
        baseScore += PRIORITY_BOOSTS.DONT_CARE_PENALTY;
        factors.push({
          type: PRIORITY_FACTOR_TYPES.NOT_IMPORTANT,
          description: `Not important: ${item.contextValue}`,
          contribution: PRIORITY_BOOSTS.DONT_CARE_PENALTY,
        });
        break;
      }
    }

    // Sentiment analysis - PRIMARY FACTOR (30% weight)
    // Use stored sentimentScore from email if available, otherwise analyze
    let { sentimentScore } = email;
    if (sentimentScore === undefined || sentimentScore === null) {
      // Fallback to rule-based sentiment if not analyzed by LLM yet
      sentimentScore = this.analyzeSentiment(email.body || "");
    }

    // Convert sentiment score (-1 to 1) to 0-100 scale
    // Negative sentiment = high priority (higher score), positive = lower priority
    // Map: -1 (very negative) -> 100, 0 (neutral) -> 50, 1 (very positive) -> 0
    const sentimentScoreNormalized = Math.max(
      PRIORITY_SCORES.MIN,
      Math.min(
        PRIORITY_SCORES.MAX,
        PRIORITY_SCORES.NEUTRAL - sentimentScore * PRIORITY_SCORES.NEUTRAL,
      ),
    );

    // Apply weight to sentiment
    const sentimentContribution = Math.round(
      sentimentScoreNormalized * PRIORITY_WEIGHTS.SENTIMENT,
    );
    // Neutral sentiment contributes 15, so adjust to make neutral = 0 contribution
    const sentimentAdjustment =
      sentimentContribution - SENTIMENT_THRESHOLDS.NEUTRAL_CONTRIBUTION;
    if (Math.abs(sentimentAdjustment) > 1) {
      // Only show if significantly different from neutral
      baseScore += sentimentAdjustment;
      factors.push({
        type: PRIORITY_FACTOR_TYPES.SENTIMENT,
        description: (() => {
          if (sentimentScore < SENTIMENT_THRESHOLDS.NEGATIVE) {
            return `Negative/urgent sentiment (${sentimentScore.toFixed(2)})`;
          } else if (sentimentScore < 0) {
            return `Slightly negative sentiment (${sentimentScore.toFixed(2)})`;
          } else if (sentimentScore > SENTIMENT_THRESHOLDS.POSITIVE) {
            return `Positive sentiment (${sentimentScore.toFixed(2)})`;
          } else {
            return "Neutral sentiment";
          }
        })(),
        contribution: Math.round(sentimentAdjustment),
      });
    }

    // Job title score
    const jobTitleScore = this.calculateJobTitleScore(
      email.senderJobTitle || "",
    );
    if (jobTitleScore > 0) {
      const jobBoost = jobTitleScore * PRIORITY_BOOSTS.JOB_TITLE_MULTIPLIER;
      baseScore += jobBoost;
      factors.push({
        type: PRIORITY_FACTOR_TYPES.SENDER_ROLE,
        description: `From ${email.senderJobTitle || "important role"}`,
        contribution: Math.round(jobBoost),
      });
    }

    // Days since last email - exponential increase in priority
    if (daysSinceLastEmail !== undefined && daysSinceLastEmail > 0) {
      const daysBoost = Math.min(
        PRIORITY_BOOSTS.MAX_DAYS_BOOST,
        PRIORITY_WEIGHTS.DAYS_MULTIPLIER *
          Math.pow(daysSinceLastEmail, PRIORITY_WEIGHTS.DAYS_EXPONENT),
      );
      baseScore += daysBoost;
      if (daysBoost > PRIORITY_BOOSTS.PROJECT_PRIORITY_3) {
        factors.push({
          type: PRIORITY_FACTOR_TYPES.RECENCY,
          description: `${Math.round(daysSinceLastEmail)} days since last email`,
          contribution: Math.round(daysBoost),
        });
      }
    }

    // Urgency is now determined by LLM and stored on EmailThread, not calculated here

    // Ensure score is between 0-100
    let finalScore = Math.max(0, Math.min(100, baseScore));

    // Factor in user override if present
    if (
      email.userPriorityOverride !== null &&
      email.userPriorityOverride !== undefined
    ) {
      // If user has overridden, use their override but still show the calculated factors
      // This allows the system to learn while respecting user's explicit choice
      // Clamp the override to 0-100 range for safety
      finalScore = Math.max(0, Math.min(100, email.userPriorityOverride));
      factors.push({
        type: PRIORITY_FACTOR_TYPES.USER_OVERRIDE,
        description: "User manually set priority",
        contribution: email.userPriorityOverride - baseScore,
      });
    }

    // Build breakdown format for UI compatibility
    const breakdown: Array<{
      factor: string;
      value: number;
      description: string;
    }> = [];
    // Get sentiment score and type for dimensions
    const emailSentimentScore = email.sentimentScore ?? 0;
    let sentimentType: "negative" | "positive" | "neutral";
    if (emailSentimentScore < SENTIMENT_THRESHOLDS.NEGATIVE) {
      sentimentType = SENTIMENT_TYPES.NEGATIVE;
    } else if (emailSentimentScore > SENTIMENT_THRESHOLDS.POSITIVE) {
      sentimentType = SENTIMENT_TYPES.POSITIVE;
    } else {
      sentimentType = SENTIMENT_TYPES.NEUTRAL;
    }
    // -1 becomes 0, 0 becomes 50, 1 becomes 100
    // Default to neutral if no sentiment
    const dimensionSentimentScore =
      emailSentimentScore !== null && emailSentimentScore !== undefined
        ? (emailSentimentScore + 1) * PRIORITY_SCORES.NEUTRAL
        : PRIORITY_SCORES.NEUTRAL;

    const dimensions = {
      urgency: { score: 0, reasons: [] as string[] },
      goalAlignment: { score: 0, reasons: [] as string[] },
      vipContact: { score: 0, reasons: [] as string[] },
      sentiment: {
        score: dimensionSentimentScore,
        type: sentimentType,
        reasons: [] as string[],
      },
    };

    // Map factors to breakdown format and group by dimension
    factors.forEach((factor) => {
      breakdown.push({
        factor: this.getFactorDisplayName(factor.type),
        value: factor.contribution,
        description: factor.description,
      });

      // Group into dimensions
      // Note: Urgency is now determined by LLM and stored on EmailThread (urgencyScore)
      // URGENT_KEYWORDS factors are no longer created - urgency comes from thread.urgencyScore
      // Dimensions store points (not percentages) for consistency
      if (factor.type === PRIORITY_FACTOR_TYPES.SENTIMENT) {
        // Sentiment is now its own dimension
        dimensions.sentiment.reasons.push(factor.description);
      } else if (
        factor.type === PRIORITY_FACTOR_TYPES.GOAL_ALIGNMENT ||
        factor.type === PRIORITY_FACTOR_TYPES.CURRENT_PROJECT
      ) {
        // eslint-disable-next-line @typescript-eslint/no-magic-numbers
        dimensions.goalAlignment.score += factor.contribution;
        // Points, not percentage
        dimensions.goalAlignment.reasons.push(factor.description);
      } else if (
        factor.type === PRIORITY_FACTOR_TYPES.VIP_CONTACT ||
        factor.type === PRIORITY_FACTOR_TYPES.SENDER_ROLE
      ) {
        // eslint-disable-next-line @typescript-eslint/no-magic-numbers
        dimensions.vipContact.score += factor.contribution;
        // Points (e.g., +25 for VIP)
        dimensions.vipContact.reasons.push(factor.description);
      }
    });

    return {
      score: finalScore,
      factors,
      // Show all factors so breakdown adds up correctly
      breakdown,
      // Show all breakdown items so they add up to the score
      dimensions,
    };
  }

  private getFactorDisplayName(type: string): string {
    return PRIORITY_FACTOR_DISPLAY_NAMES[type] || type;
  }

  /**
   * Calculate priority score using user context (backwards compatible)
   */
  calculateBasicPriorityScore(
    email: Partial<Email>,
    contexts: UserContext[],
    daysSinceLastEmail?: number,
  ): number {
    return this.calculatePriorityWithExplanation(
      email,
      contexts,
      daysSinceLastEmail,
    ).score;
  }

  async calculatePriorityScore(
    userId: string,
    email: Partial<Email>,
  ): Promise<number> {
    // Get user context for prioritization
    const contexts = await this.userContextRepository.find({
      where: { userId },
    });

    return this.calculateBasicPriorityScore(email, contexts);
  }

  async getUserContexts(userId: string): Promise<UserContext[]> {
    return this.userContextRepository.find({
      where: { userId },
    });
  }

  analyzeSentiment(text: string): number {
    const tokenizer = new natural.WordTokenizer();
    const tokens = tokenizer.tokenize(text.toLowerCase()) || [];

    // Urgency indicators (positive sentiment for priority)
    const urgencyWords = [
      "urgent",
      "important",
      "asap",
      "critical",
      "deadline",
      "meeting",
      "action",
      "immediate",
      "soon",
    ];
    // Upset/negative sentiment indicators (should increase priority)
    const upsetWords = [
      "disappointed",
      "frustrated",
      "concerned",
      "unhappy",
      "upset",
      "angry",
      "worried",
      "disappointing",
      "problem",
      "issue",
      "error",
      "wrong",
      "failed",
      "failure",
    ];
    // Low priority indicators
    const lowPriorityWords = [
      "no rush",
      "whenever",
      "optional",
      "low priority",
      "when convenient",
      "no hurry",
    ];

    let score = 0;
    tokens.forEach((token) => {
      if (urgencyWords.some((w) => token.includes(w)))
        score += SENTIMENT_THRESHOLDS.URGENCY_BOOST;
      // Upset emails get higher boost
      if (upsetWords.some((w) => token.includes(w)))
        score += SENTIMENT_THRESHOLDS.UPSET_BOOST;
      if (lowPriorityWords.some((w) => token.includes(w)))
        score += SENTIMENT_THRESHOLDS.LOW_PRIORITY_PENALTY;
    });

    return Math.max(
      -1,
      Math.min(1, score / SENTIMENT_THRESHOLDS.NORMALIZATION_DIVISOR),
    );
  }

  calculateJobTitleScore(jobTitle: string): number {
    if (!jobTitle) return 0;

    const highPriorityTitles = [
      "ceo",
      "president",
      "director",
      "manager",
      "lead",
      "head",
    ];
    const titleLower = jobTitle.toLowerCase();

    for (const title of highPriorityTitles) {
      if (titleLower.includes(title)) return JOB_TITLE_SCORES.HIGH_PRIORITY;
    }

    return JOB_TITLE_SCORES.DEFAULT;
  }

  /**
   * Apply user override to email priority score
   */
  async applyUserOverride(
    userId: string,
    emailId: string,
    priorityScore: number,
    reasonType?: string,
    reasonText?: string,
  ): Promise<void> {
    const email = await this.emailRepository.findOne({
      where: { id: emailId, userId },
      relations: ["thread"],
    });

    if (!email) {
      throw new Error("Email not found");
    }

    // Get priority explanation from thread
    let thread = null;
    if (email.emailThreadId) {
      thread = await this.emailThreadRepository.findOne({
        where: { id: email.emailThreadId },
      });
    }

    const originalScore = calculateScoreFromBreakdown(
      thread?.priorityExplanation,
    );

    // Update email with override (priority score is calculated from breakdown, not stored)
    await this.emailRepository.update(
      { id: emailId },
      {
        userPriorityOverride: Math.max(0, Math.min(100, priorityScore)),
        priorityOverrideReason: reasonText || null,
        priorityOverrideReasonType: reasonType || null,
      },
    );

    // Store override in PriorityOverride table for learning
    await this.priorityOverrideRepository.save({
      emailId,
      userId,
      originalPriorityScore: originalScore,
      userPriorityScore: priorityScore,
      reasonType:
        (reasonType as OverrideReasonType) || OverrideReasonType.OTHER,
      reasonText: reasonText || null,
    });

    this.logger.log(
      `Applied user priority override for email ${emailId}: ${originalScore} -> ${priorityScore}`,
    );
  }
}
