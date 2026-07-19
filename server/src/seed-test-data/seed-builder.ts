import { PriorityBand, SeedEmailSpec } from "./seed-types";

const HIGH_SCORE_BASE = 70;
const MEDIUM_SCORE_BASE = 40;
const LOW_SCORE_BASE = 5;
const STANDARD_SCORE_SPAN = 26;
const LOW_SCORE_SPAN = 31;
const URGENCY_RATIO = 0.7;
const SENTIMENT_VALUE = 8;
const GOAL_HIGH = 22;
const GOAL_MEDIUM = 14;
const GOAL_LOW = 6;
const VIP_HIGH = 18;
const VIP_MEDIUM = 11;
const VIP_LOW = 4;
const READ_EVERY = 3;

interface BandConfig {
  scoreBase: number;
  scoreSpan: number;
  goal: number;
  vip: number;
  urgencyReasons: string[];
  goalReasons: string[];
  vipReasons: string[];
  sentimentType: string;
}

const BAND_CONFIG: Record<PriorityBand, BandConfig> = {
  high: {
    scoreBase: HIGH_SCORE_BASE,
    scoreSpan: STANDARD_SCORE_SPAN,
    goal: GOAL_HIGH,
    vip: VIP_HIGH,
    urgencyReasons: ["Deadline mentioned", "Time-sensitive content"],
    goalReasons: ["Directly tied to an active priority"],
    vipReasons: ["From a key contact"],
    sentimentType: "urgent",
  },
  medium: {
    scoreBase: MEDIUM_SCORE_BASE,
    scoreSpan: STANDARD_SCORE_SPAN,
    goal: GOAL_MEDIUM,
    vip: VIP_MEDIUM,
    urgencyReasons: ["Some time sensitivity"],
    goalReasons: ["Related to ongoing work"],
    vipReasons: ["Known contact"],
    sentimentType: "neutral",
  },
  low: {
    scoreBase: LOW_SCORE_BASE,
    scoreSpan: LOW_SCORE_SPAN,
    goal: GOAL_LOW,
    vip: VIP_LOW,
    urgencyReasons: ["No deadline detected"],
    goalReasons: ["Tangential to current goals"],
    vipReasons: ["Not a known contact"],
    sentimentType: "neutral",
  },
};

/**
 * Deterministic priority score within a band's range. Jitter is derived from the
 * index so re-seeding produces the same spread (no randomness).
 */
export function bandScore(band: PriorityBand, index: number): number {
  const config = BAND_CONFIG[band];
  return config.scoreBase + (index % config.scoreSpan);
}

/** Urgency tracks priority but a little lower, so the tooltip looks plausible. */
export function bandUrgency(score: number): number {
  return Math.max(0, Math.round(score * URGENCY_RATIO));
}

type Explanation = {
  score: number;
  dimensions: {
    urgency: { score: number; reasons: string[] };
    goalAlignment: { score: number; reasons: string[] };
    vipContact: { score: number; reasons: string[] };
    sentiment: { score: number; type: string; reasons: string[] };
  };
  breakdown: Array<{ factor: string; value: number; description: string }>;
  calculatedAt: string;
};

/**
 * Builds a realistic `priorityExplanation` (the shape the inbox tooltip reads).
 * Factor names use the emoji-prefixed format produced by the real pipeline so the
 * tooltip renders them; dimension values sum to ≤ 100.
 */
export function buildPriorityExplanation(
  band: PriorityBand,
  score: number,
  isoTimestamp: string,
): Explanation {
  const config = BAND_CONFIG[band];
  const urgency = bandUrgency(score);
  return {
    score,
    dimensions: {
      urgency: { score: urgency, reasons: config.urgencyReasons },
      goalAlignment: { score: config.goal, reasons: config.goalReasons },
      vipContact: { score: config.vip, reasons: config.vipReasons },
      sentiment: {
        score: SENTIMENT_VALUE,
        type: config.sentimentType,
        reasons: ["Professional tone"],
      },
    },
    breakdown: [
      {
        factor: "⭐ VIP Contact",
        value: config.vip,
        description: config.vipReasons[0],
      },
      {
        factor: "🎯 Goal Alignment",
        value: config.goal,
        description: config.goalReasons[0],
      },
      {
        factor: "🔥 Urgency",
        value: urgency,
        description: config.urgencyReasons[0],
      },
      {
        factor: "😊 Sentiment",
        value: SENTIMENT_VALUE,
        description: "Professional tone",
      },
    ],
    calculatedAt: isoTimestamp,
  };
}

/** A pool the generator cycles through to pad a persona out to 150 realistic emails. */
export interface CategoryPool {
  categorySlug: string;
  senders: Array<{ name: string; email: string }>;
  items: Array<{ subject: string; summary: string; band: PriorityBand }>;
}

/**
 * Deterministically generate `count` filler emails by cycling pools × items × senders.
 * No randomness — index-driven so re-seeding is stable. Subjects repeat across cycles
 * (realistic for newsletters/notifications); uniqueness is guaranteed by messageId index.
 */
export function generateFromPools(
  pools: CategoryPool[],
  count: number,
): SeedEmailSpec[] {
  const out: SeedEmailSpec[] = [];
  if (pools.length === 0) {
    return out;
  }
  for (let i = 0; i < count; i++) {
    const pool = pools[i % pools.length];
    const cycle = Math.floor(i / pools.length);
    const item = pool.items[cycle % pool.items.length];
    const sender = pool.senders[i % pool.senders.length];
    out.push({
      fromName: sender.name,
      fromEmail: sender.email,
      subject: item.subject,
      categorySlug: pool.categorySlug,
      band: item.band,
      summary: item.summary,
      isRead: i % READ_EVERY === 0,
    });
  }
  return out;
}

const DEFAULT_TOTAL = 150;

/** Assemble a persona's 150 emails: hand-authored "hero" emails first, then generated filler. */
export function assemblePersonaEmails(
  heroes: SeedEmailSpec[],
  fillerPools: CategoryPool[],
  total: number = DEFAULT_TOTAL,
): SeedEmailSpec[] {
  const fillerCount = Math.max(0, total - heroes.length);
  return [...heroes, ...generateFromPools(fillerPools, fillerCount)];
}
