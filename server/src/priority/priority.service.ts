import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import * as natural from "natural";
import { Repository } from "typeorm";

import { ERROR_MESSAGES } from "../constants/error-messages";
import {
  JOB_TITLE_SCORES,
  PRIORITY_BOOSTS,
  PRIORITY_FACTOR_DISPLAY_NAMES,
  PRIORITY_FACTOR_TYPES,
  PRIORITY_SCORES,
  PRIORITY_WEIGHTS,
  SENTIMENT_THRESHOLDS,
  SENTIMENT_TYPES,
} from "../constants/priority-constants";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import {
  OverrideReasonType,
  PriorityOverride,
} from "../database/entities/priority-override.entity";
import {
  ContextKey,
  UserContext,
} from "../database/entities/user-context.entity";
import { decryptUserContextEntityForApi } from "../encryption/entity-api-decrypt.util";
import { LLMService } from "../llm/llm.service";
import { calculateScoreFromBreakdown } from "../utils/priority.utils";

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
  calculatePriorityWithExplanation(
    email: Partial<Email>,
    contexts: UserContext[],
    daysSinceLastEmail?: number,
  ): PriorityExplanation {
    const { baseScore, factors } = this.collectPriorityFactors(
      email,
      contexts,
      daysSinceLastEmail,
    );
    const finalScore = this.applyUserPriorityOverride(
      baseScore,
      email.userPriorityOverride,
      factors,
    );
    return this.buildPriorityExplanation(finalScore, factors, email);
  }

  private addFactorToScore(
    baseScore: number,
    factors: Array<{ type: string; description: string; contribution: number }>,
    type: string,
    result: { score: number; explanation: string },
    shouldAdd: boolean,
  ): number {
    if (shouldAdd) {
      factors.push({
        type,
        description: result.explanation,
        contribution: result.score,
      });
      return baseScore + result.score;
    }
    return baseScore;
  }

  private collectPriorityFactors(
    email: Partial<Email>,
    contexts: UserContext[],
    daysSinceLastEmail?: number,
  ): {
    baseScore: number;
    factors: Array<{ type: string; description: string; contribution: number }>;
  } {
    const factors: Array<{
      type: string;
      description: string;
      contribution: number;
    }> = [];

    const vipResult = this.calculateVipBoost(
      email.from || "",
      email.fromName || "",
      contexts,
    );
    let baseScore = this.addFactorToScore(
      0,
      factors,
      PRIORITY_FACTOR_TYPES.VIP_CONTACT,
      vipResult,
      vipResult.score !== 0,
    );

    const goalResult = this.calculateGoalAlignment(
      email.subject || "",
      email.body || "",
      contexts,
    );
    baseScore = this.addFactorToScore(
      baseScore,
      factors,
      PRIORITY_FACTOR_TYPES.GOAL_ALIGNMENT,
      goalResult,
      goalResult.score > 0,
    );

    const projectResult = this.calculateProjectBoost(
      email.subject || "",
      email.body || "",
      contexts,
    );
    baseScore = this.addFactorToScore(
      baseScore,
      factors,
      PRIORITY_FACTOR_TYPES.CURRENT_PROJECT,
      projectResult,
      projectResult.score !== 0,
    );

    const dontCareResult = this.calculateDontCarePenalty(
      email.subject || "",
      email.body || "",
      contexts,
    );
    baseScore = this.addFactorToScore(
      baseScore,
      factors,
      PRIORITY_FACTOR_TYPES.NOT_IMPORTANT,
      dontCareResult,
      dontCareResult.score !== 0,
    );

    const sentimentResult = this.calculateSentimentScore(email);
    baseScore = this.addFactorToScore(
      baseScore,
      factors,
      PRIORITY_FACTOR_TYPES.SENTIMENT,
      sentimentResult,
      sentimentResult.score !== 0,
    );

    const jobTitleResult = this.calculateJobTitleBoost(
      email.senderJobTitle || "",
    );
    baseScore = this.addFactorToScore(
      baseScore,
      factors,
      PRIORITY_FACTOR_TYPES.SENDER_ROLE,
      jobTitleResult,
      jobTitleResult.score !== 0,
    );

    const recencyResult = this.calculateRecencyBoost(daysSinceLastEmail);
    baseScore = this.addFactorToScore(
      baseScore,
      factors,
      PRIORITY_FACTOR_TYPES.RECENCY,
      recencyResult,
      recencyResult.score !== 0,
    );

    return { baseScore, factors };
  }

  private applyUserPriorityOverride(
    baseScore: number,
    userPriorityOverride: number | null | undefined,
    factors: Array<{ type: string; description: string; contribution: number }>,
  ): number {
    const clampedBase = Math.max(0, Math.min(100, baseScore));
    if (userPriorityOverride !== null && userPriorityOverride !== undefined) {
      const finalScore = Math.max(0, Math.min(100, userPriorityOverride));
      factors.push({
        type: PRIORITY_FACTOR_TYPES.USER_OVERRIDE,
        description: "User manually set priority",
        contribution: userPriorityOverride - baseScore,
      });
      return finalScore;
    }
    return clampedBase;
  }

  private buildPriorityExplanation(
    finalScore: number,
    factors: Array<{ type: string; description: string; contribution: number }>,
    email: Partial<Email>,
  ): PriorityExplanation {
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
        dimensions.goalAlignment.score += factor.contribution;
        // Points, not percentage
        dimensions.goalAlignment.reasons.push(factor.description);
      } else if (
        factor.type === PRIORITY_FACTOR_TYPES.VIP_CONTACT ||
        factor.type === PRIORITY_FACTOR_TYPES.SENDER_ROLE
      ) {
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

  private calculateVipBoost(
    fromEmail: string,
    fromName: string,
    contexts: UserContext[],
  ): { score: number; explanation: string } {
    const vipContacts = contexts.filter(
      (contact) => contact.contextKey === ContextKey.VIP_CONTACT,
    );
    const matchingVip = vipContacts.find(
      (vip) =>
        fromEmail.toLowerCase().includes(vip.contextValue.toLowerCase()) ||
        fromName.toLowerCase().includes(vip.contextValue.toLowerCase()),
    );
    if (matchingVip) {
      return {
        score: PRIORITY_BOOSTS.VIP_CONTACT,
        explanation: `From VIP contact: ${matchingVip.contextValue}`,
      };
    }
    return { score: 0, explanation: "" };
  }

  private calculateGoalAlignment(
    subject: string,
    body: string,
    contexts: UserContext[],
  ): { score: number; explanation: string } {
    const goals = contexts.filter(
      (item) => item.contextKey === ContextKey.MY_GOALS,
    );
    if (goals.length === 0) {
      return { score: 0, explanation: "" };
    }

    const emailText = `${subject} ${body}`.toLowerCase();
    const matchingGoals: string[] = [];

    for (const goal of goals) {
      const keywords = goal.contextValue
        .toLowerCase()
        .split(/[,;]/)
        .map((key) => key.trim())
        .filter(Boolean);
      if (keywords.some((keyword) => emailText.includes(keyword))) {
        matchingGoals.push(goal.contextValue);
      }
    }

    // Calculate goal alignment as percentage (0-100)
    const goalAlignmentScore = Math.min(
      100,
      Math.round((matchingGoals.length / goals.length) * 100),
    );

    // Apply weight to goal alignment
    const contribution = Math.round(
      goalAlignmentScore * PRIORITY_WEIGHTS.GOAL_ALIGNMENT,
    );
    if (contribution <= 0) {
      return { score: 0, explanation: "" };
    }

    const explanation =
      matchingGoals.length > 0
        ? `Aligned with goals: ${matchingGoals.join(", ")}`
        : "No goal alignment";

    return { score: contribution, explanation };
  }

  private calculateProjectBoost(
    subject: string,
    body: string,
    contexts: UserContext[],
  ): { score: number; explanation: string } {
    const workingOn = contexts.filter(
      (item) => item.contextKey === ContextKey.WORKING_ON,
    );
    const emailText = `${subject} ${body}`.toLowerCase();

    for (const project of workingOn) {
      const keywords = project.contextValue
        .toLowerCase()
        .split(/[,;]/)
        .map((key) => key.trim())
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
        return {
          score: priorityBoost,
          explanation: `Related to current work: ${project.contextValue}`,
        };
        // Only count one project match
      }
    }

    return { score: 0, explanation: "" };
  }

  private calculateDontCarePenalty(
    subject: string,
    body: string,
    contexts: UserContext[],
  ): { score: number; explanation: string } {
    const dontCare = contexts.filter(
      (item) => item.contextKey === ContextKey.DONT_CARE,
    );
    const emailText = `${subject} ${body}`.toLowerCase();

    for (const item of dontCare) {
      const keywords = item.contextValue
        .toLowerCase()
        .split(/[,;]/)
        .map((key) => key.trim())
        .filter(Boolean);
      if (keywords.some((keyword) => emailText.includes(keyword))) {
        return {
          score: PRIORITY_BOOSTS.DONT_CARE_PENALTY,
          explanation: `Not important: ${item.contextValue}`,
        };
      }
    }

    return { score: 0, explanation: "" };
  }

  private calculateSentimentScore(email: Partial<Email>): {
    score: number;
    explanation: string;
  } {
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

    if (Math.abs(sentimentAdjustment) <= 1) {
      // Only show if significantly different from neutral
      return { score: 0, explanation: "" };
    }

    let explanation: string;
    if (sentimentScore < SENTIMENT_THRESHOLDS.NEGATIVE) {
      explanation = `Negative/urgent sentiment (${sentimentScore.toFixed(2)})`;
    } else if (sentimentScore < 0) {
      explanation = `Slightly negative sentiment (${sentimentScore.toFixed(2)})`;
    } else if (sentimentScore > SENTIMENT_THRESHOLDS.POSITIVE) {
      explanation = `Positive sentiment (${sentimentScore.toFixed(2)})`;
    } else {
      explanation = "Neutral sentiment";
    }

    return { score: Math.round(sentimentAdjustment), explanation };
  }

  private calculateJobTitleBoost(senderJobTitle: string): {
    score: number;
    explanation: string;
  } {
    const jobTitleScore = this.calculateJobTitleScore(senderJobTitle);
    if (jobTitleScore <= 0) {
      return { score: 0, explanation: "" };
    }
    const jobBoost = Math.round(
      jobTitleScore * PRIORITY_BOOSTS.JOB_TITLE_MULTIPLIER,
    );
    return {
      score: jobBoost,
      explanation: `From ${senderJobTitle || "important role"}`,
    };
  }

  private calculateRecencyBoost(daysSinceLastEmail?: number): {
    score: number;
    explanation: string;
  } {
    if (daysSinceLastEmail === undefined || daysSinceLastEmail <= 0) {
      return { score: 0, explanation: "" };
    }

    // Days since last email - exponential increase in priority
    const daysBoost = Math.min(
      PRIORITY_BOOSTS.MAX_DAYS_BOOST,
      PRIORITY_WEIGHTS.DAYS_MULTIPLIER *
        Math.pow(daysSinceLastEmail, PRIORITY_WEIGHTS.DAYS_EXPONENT),
    );

    if (daysBoost <= PRIORITY_BOOSTS.PROJECT_PRIORITY_3) {
      return { score: 0, explanation: "" };
    }

    return {
      score: Math.round(daysBoost),
      explanation: `${Math.round(daysSinceLastEmail)} days since last email`,
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
    for (const ctx of contexts) {
      decryptUserContextEntityForApi(ctx);
    }

    return this.calculateBasicPriorityScore(email, contexts);
  }

  async getUserContexts(userId: string): Promise<UserContext[]> {
    const contexts = await this.userContextRepository.find({
      where: { userId },
    });
    for (const ctx of contexts) {
      decryptUserContextEntityForApi(ctx);
    }
    return contexts;
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
      if (urgencyWords.some((word) => token.includes(word)))
        score += SENTIMENT_THRESHOLDS.URGENCY_BOOST;
      // Upset emails get higher boost
      if (upsetWords.some((word) => token.includes(word)))
        score += SENTIMENT_THRESHOLDS.UPSET_BOOST;
      if (lowPriorityWords.some((word) => token.includes(word)))
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
      relations: {
        thread: true,
      },
    });

    if (!email) {
      throw new Error(ERROR_MESSAGES.EMAIL_NOT_FOUND);
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
