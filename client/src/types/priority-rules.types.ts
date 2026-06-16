export type PriorityBand = 'urgent' | 'high' | 'medium' | 'low' | 'very_low';

export const PRIORITY_BANDS: readonly PriorityBand[] = [
  'urgent',
  'high',
  'medium',
  'low',
  'very_low',
];

export const PRIORITY_RULE_SOURCE = {
  MINED: 'mined',
  USER: 'user',
} as const;

export type PriorityRuleSource = (typeof PRIORITY_RULE_SOURCE)[keyof typeof PRIORITY_RULE_SOURCE];

/** Mirrors the server PriorityRuleDto (GET /priority-rules). */
export interface PriorityRuleDto {
  id: string;
  /** Representative sender pattern the rule matches on. */
  sender: string;
  /** All sender patterns the rule matches (one per line in the edit form). */
  senders: string[];
  subjectContainsAny: string[];
  bodyContainsAny: string[];
  band: PriorityBand;
  representativeScore: number;
  /** 'mined' = auto-learned; 'user' = manually created/edited. */
  source: PriorityRuleSource;
  /** Number of LLM-labelled threads the rule was learned from (0 for manual). */
  sampleCount: number;
  /** Fraction (0-1) of those threads that fell in `band`. */
  dominantBandShare: number;
  /** How many times the rule has driven a deterministic (LLM-skipped) score. */
  hitCount: number;
  shadowSampleCount: number;
  shadowDivergenceCount: number;
  divergenceRate: number | null;
  isEnabled: boolean;
  lastValidatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Create/update payload for a user-managed priority rule. */
export interface UpsertPriorityRulePayload {
  senders?: string[];
  band?: PriorityBand;
  subjectContainsAny?: string[];
  bodyContainsAny?: string[];
  isEnabled?: boolean;
}
