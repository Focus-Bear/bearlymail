import type { PriorityBand } from "../constants/priority-band";
import type { PriorityRuleSource } from "../constants/priority-rule.constants";

/** Result of a deterministic priority-rule match for a thread/email. */
export interface PriorityRuleMatch {
  ruleId: string;
  band: PriorityBand;
  /** Score to write to the thread (derived from `band`). */
  representativeScore: number;
}

/** Inspect-friendly view of a priority rule for the settings/admin surface. */
export interface PriorityRuleDto {
  id: string;
  /** Representative sender pattern from the rule spec (decrypted). */
  sender: string;
  /** All sender patterns the rule matches (for the edit form). */
  senders: string[];
  /** Optional subject-contains phrases (any-match). */
  subjectContainsAny: string[];
  /** Optional body-contains phrases (any-match). */
  bodyContainsAny: string[];
  band: PriorityBand;
  representativeScore: number;
  /** 'mined' = auto-learned; 'user' = manually created/edited. */
  source: PriorityRuleSource;
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

/** Create/update payload for a user-managed priority rule. All optional on update. */
export interface UpsertPriorityRuleInput {
  senders?: string[];
  band?: PriorityBand;
  subjectContainsAny?: string[];
  bodyContainsAny?: string[];
  isEnabled?: boolean;
}
