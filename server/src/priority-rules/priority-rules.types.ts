import type { PriorityBand } from "../constants/priority-band";

/** Result of a deterministic priority-rule match for a thread/email. */
export interface PriorityRuleMatch {
  ruleId: string;
  band: PriorityBand;
  /** Score to write to the thread (derived from `band`). */
  representativeScore: number;
}

/** Inspect-friendly view of a priority rule for the admin/debug surface. */
export interface PriorityRuleDto {
  id: string;
  /** Representative sender pattern from the rule spec (decrypted). */
  sender: string;
  band: PriorityBand;
  representativeScore: number;
  sampleCount: number;
  dominantBandShare: number;
  hitCount: number;
  shadowSampleCount: number;
  shadowDivergenceCount: number;
  /** diverged / sampled, or null when there are no shadow samples yet. */
  divergenceRate: number | null;
  isEnabled: boolean;
  lastValidatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
