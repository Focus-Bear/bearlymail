import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Email } from "../database/entities/email.entity";
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
    let baseScore = 0;
    const factors: Array<{
      type: string;
      description: string;
      contribution: number;
    }> = [];

    // VIP Contact boost (+25)
    const vipContacts = contexts.filter(
      (c) => c.contextKey === ContextKey.VIP_CONTACT,
    );
    const matchingVip = vipContacts.find(
      (vip) =>
        email.from?.toLowerCase().includes(vip.contextValue.toLowerCase()) ||
        email.fromName?.toLowerCase().includes(vip.contextValue.toLowerCase()),
    );
    if (matchingVip) {
      baseScore += 25;
      factors.push({
        type: "VIP_CONTACT",
        description: `From VIP contact: ${matchingVip.contextValue}`,
        contribution: 25,
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

    // Apply 40% weight to goal alignment
    const goalAlignmentContribution = Math.round(goalAlignmentScore * 0.4);
    if (goalAlignmentContribution > 0) {
      baseScore += goalAlignmentContribution;
      factors.push({
        type: "GOAL_ALIGNMENT",
        description:
          matchingGoals.length > 0
            ? `Aligned with goals: ${matchingGoals.join(", ")}`
            : "No goal alignment",
        contribution: goalAlignmentContribution,
      });
    }

    // Working on / Current projects boost (+15 max, weighted by priority)
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
        const priorityBoost =
          project.priority === 1 ? 15 : project.priority === 2 ? 10 : 5;
        baseScore += priorityBoost;
        factors.push({
          type: "CURRENT_PROJECT",
          description: `Related to current work: ${project.contextValue}`,
          contribution: priorityBoost,
        });
        break; // Only count one project match
      }
    }

    // Don't care penalty (-20)
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
        baseScore -= 20;
        factors.push({
          type: "NOT_IMPORTANT",
          description: `Not important: ${item.contextValue}`,
          contribution: -20,
        });
        break;
      }
    }

    // Sentiment analysis - PRIMARY FACTOR (30% weight)
    // Use stored sentimentScore from email if available, otherwise analyze
    let sentimentScore = email.sentimentScore;
    if (sentimentScore === undefined || sentimentScore === null) {
      // Fallback to rule-based sentiment if not analyzed by LLM yet
      sentimentScore = this.analyzeSentiment(email.body || "");
    }

    // Convert sentiment score (-1 to 1) to 0-100 scale
    // Negative sentiment = high priority (higher score), positive = lower priority
    // Map: -1 (very negative) -> 100, 0 (neutral) -> 50, 1 (very positive) -> 0
    const sentimentScoreNormalized = Math.max(
      0,
      Math.min(100, 50 - sentimentScore * 50),
    );

    // Apply 30% weight to sentiment
    const sentimentContribution = Math.round(sentimentScoreNormalized * 0.3);
    // Neutral sentiment (50) contributes 15, so adjust to make neutral = 0 contribution
    const sentimentAdjustment = sentimentContribution - 15;
    if (Math.abs(sentimentAdjustment) > 1) {
      // Only show if significantly different from neutral
      baseScore += sentimentAdjustment;
      factors.push({
        type: "SENTIMENT",
        description:
          sentimentScore < -0.3
            ? `Negative/urgent sentiment (${sentimentScore.toFixed(2)})`
            : sentimentScore < 0
              ? `Slightly negative sentiment (${sentimentScore.toFixed(2)})`
              : sentimentScore > 0.3
                ? `Positive sentiment (${sentimentScore.toFixed(2)})`
                : "Neutral sentiment",
        contribution: Math.round(sentimentAdjustment),
      });
    }

    // Job title score
    const jobTitleScore = this.calculateJobTitleScore(
      email.senderJobTitle || "",
    );
    if (jobTitleScore > 0) {
      const jobBoost = jobTitleScore * 10;
      baseScore += jobBoost;
      factors.push({
        type: "SENDER_ROLE",
        description: `From ${email.senderJobTitle || "important role"}`,
        contribution: Math.round(jobBoost),
      });
    }

    // Days since last email - exponential increase in priority
    if (daysSinceLastEmail !== undefined && daysSinceLastEmail > 0) {
      const daysBoost = Math.min(30, 2 * Math.pow(daysSinceLastEmail, 1.5));
      baseScore += daysBoost;
      if (daysBoost > 5) {
        factors.push({
          type: "RECENCY",
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
      finalScore = email.userPriorityOverride;
      factors.push({
        type: "USER_OVERRIDE",
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
    const sentimentType = emailSentimentScore < -0.3 ? 'negative' : emailSentimentScore > 0.3 ? 'positive' : 'neutral';
    const dimensionSentimentScore = emailSentimentScore !== null && emailSentimentScore !== undefined
      ? (emailSentimentScore + 1) * 50 // -1 becomes 0, 0 becomes 50, 1 becomes 100
      : 50; // Default to neutral if no sentiment

    const dimensions = {
      urgency: { score: 0, reasons: [] as string[] },
      goalAlignment: { score: 0, reasons: [] as string[] },
      vipContact: { score: 0, reasons: [] as string[] },
      sentiment: { score: dimensionSentimentScore, type: sentimentType, reasons: [] as string[] },
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
      if (factor.type === "SENTIMENT") {
        // Sentiment is now its own dimension
        dimensions.sentiment.reasons.push(factor.description);
      } else if (
        factor.type === "GOAL_ALIGNMENT" ||
        factor.type === "CURRENT_PROJECT"
      ) {
        dimensions.goalAlignment.score += factor.contribution; // Points, not percentage
        dimensions.goalAlignment.reasons.push(factor.description);
      } else if (
        factor.type === "VIP_CONTACT" ||
        factor.type === "SENDER_ROLE"
      ) {
        dimensions.vipContact.score += factor.contribution; // Points (e.g., +25 for VIP)
        dimensions.vipContact.reasons.push(factor.description);
      }
    });

    return {
      score: finalScore,
      factors: factors, // Show all factors so breakdown adds up correctly
      breakdown: breakdown, // Show all breakdown items so they add up to the score
      dimensions,
    };
  }

  private getFactorDisplayName(type: string): string {
    const displayNames: Record<string, string> = {
      VIP_CONTACT: "⭐ VIP Contact",
      GOAL_ALIGNMENT: "🎯 Goal Alignment",
      CURRENT_PROJECT: "📋 Current Project",
      NOT_IMPORTANT: "❌ Not Important",
      SENTIMENT: "😊 Sentiment",
      SENDER_ROLE: "👔 Sender Role",
      RECENCY: "⏰ Recency",
      URGENT_KEYWORDS: "🚨 Urgent Keywords",
      USER_OVERRIDE: "✏️ User Override",
    };
    return displayNames[type] || type;
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
      if (urgencyWords.some((w) => token.includes(w))) score += 1;
      if (upsetWords.some((w) => token.includes(w))) score += 1.5; // Upset emails get higher boost
      if (lowPriorityWords.some((w) => token.includes(w))) score -= 1;
    });

    return Math.max(-1, Math.min(1, score / 10));
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
      if (titleLower.includes(title)) return 1;
    }

    return 0.5;
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
    });

    if (!email) {
      throw new Error("Email not found");
    }

    const originalScore = email.priorityScore;

    // Update email with override
    await this.emailRepository.update(
      { id: emailId },
      {
        priorityScore: Math.max(0, Math.min(100, priorityScore)),
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
