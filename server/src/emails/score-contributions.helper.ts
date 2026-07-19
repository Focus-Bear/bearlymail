import {
  NEWSLETTER_DISCOUNT,
  SENTIMENT_THRESHOLDS,
} from "../constants/priority-constants";

export const SCORE_CONTRIBUTION_WEIGHTS = {
  SENTIMENT_MULTIPLIER: 30,
  URGENCY_NEUTRAL: 50,
  // Urgency contributes (urgencyScore − URGENCY_NEUTRAL) × URGENCY_WEIGHT,
  // i.e. −40…+40 — symmetric with goal alignment's 0…+40 range.
  URGENCY_WEIGHT: 0.8,
  GOAL_ALIGNMENT_WEIGHT: 0.4,
} as const;

/**
 * Convert the LLM's raw 0–100 dimension scores into the point contributions
 * that sum to the composite priority score. Newsletters have urgency and goal
 * alignment heavily discounted.
 */
export function calculateScoreContributions(llmResult: {
  urgencyScore: number;
  goalAlignmentScore: number;
  sentimentScore?: number;
  category?: string;
}): {
  urgencyScore: number;
  goalAlignmentScore: number;
  sentimentScore: number;
  urgencyContribution: number;
  goalAlignmentContribution: number;
  sentimentContribution: number;
} {
  const goalAlignmentScore = llmResult.goalAlignmentScore || 0;
  const sentimentScore = llmResult.sentimentScore ?? 0;
  const urgencyScore = llmResult.urgencyScore || 0;

  const isNewsletterCategory = NEWSLETTER_DISCOUNT.CATEGORY_PATTERNS.some(
    (pattern) => (llmResult.category || "").toLowerCase().includes(pattern),
  );

  let sentimentContribution = 0;
  if (sentimentScore < SENTIMENT_THRESHOLDS.NEGATIVE) {
    sentimentContribution = Math.round(
      -sentimentScore * SCORE_CONTRIBUTION_WEIGHTS.SENTIMENT_MULTIPLIER,
    );
  }

  let urgencyContribution = Math.round(
    (urgencyScore - SCORE_CONTRIBUTION_WEIGHTS.URGENCY_NEUTRAL) *
      SCORE_CONTRIBUTION_WEIGHTS.URGENCY_WEIGHT,
  );

  let goalAlignmentContribution = Math.round(
    goalAlignmentScore * SCORE_CONTRIBUTION_WEIGHTS.GOAL_ALIGNMENT_WEIGHT,
  );

  if (isNewsletterCategory) {
    urgencyContribution = Math.round(
      urgencyContribution * NEWSLETTER_DISCOUNT.URGENCY_MULTIPLIER,
    );
    goalAlignmentContribution = Math.round(
      goalAlignmentContribution * NEWSLETTER_DISCOUNT.GOAL_ALIGNMENT_MULTIPLIER,
    );
  }

  return {
    urgencyScore,
    goalAlignmentScore,
    sentimentScore,
    urgencyContribution,
    goalAlignmentContribution,
    sentimentContribution,
  };
}
