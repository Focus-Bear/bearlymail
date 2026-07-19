import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { PriorityBand } from "../../constants/priority-band";
import { PriorityRuleSource } from "../../constants/priority-rule.constants";
import { makeEncryptedJsonTransformer } from "../../encryption/encryption.helper";
import { CompositeCategoryRuleSpec } from "./category-rule.entity";
import { User } from "./user.entity";

/**
 * Deterministic priority rules learned from the LLM's own scores: once a
 * sender/pattern has accumulated enough labelled threads whose priority scores
 * cluster tightly in one band, a rule is mined so future matching threads get a
 * band score in code, skipping the `analyze_priority` LLM call.
 *
 * Matching reuses the category-rule composite spec + `evaluateComposite()`, so
 * `compositeSpec` is the same encrypted-JSON shape (`CompositeCategoryRuleSpec`)
 * as `CategoryRule`. What differs is the payload: instead of a category name, a
 * priority rule carries a `band` (+ derived `representativeScore`) and the
 * consistency stats it was mined from.
 */
@Entity("priority_rules")
@Index(["userId", "isEnabled"])
export class PriorityRule {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  userId: string;

  /** Encrypted JSON; same composite-spec shape as CategoryRule (v1/v2/v3). */
  @Column("text", {
    transformer: makeEncryptedJsonTransformer("priority_rules.compositeSpec"),
  })
  compositeSpec: CompositeCategoryRuleSpec;

  @Column({
    type: "enum",
    enum: ["urgent", "high", "medium", "low", "very_low"],
  })
  band: PriorityBand;

  /** Score written to the thread when this rule matches (derived from band). */
  @Column({ type: "int" })
  representativeScore: number;

  /** Number of labelled threads the rule was mined from (gate: ≥25). */
  @Column({ type: "int", default: 0 })
  sampleCount: number;

  /**
   * Fraction (0-1) of the mined threads that fell in `band` — the consistency
   * measure that replaces category's "0 false positives" gate. A rule only
   * forms when this clears the dominant-band threshold (≥0.9).
   */
  @Column({ type: "float", default: 0 })
  dominantBandShare: number;

  @Column({ default: true })
  isEnabled: boolean;

  /**
   * 'mined' = auto-learned and managed by the miner (may be refreshed/retired
   * automatically). 'user' = manually created or edited; the miner leaves it
   * alone (never overwrites the band/spec, never auto-retires it).
   */
  @Column({ type: "varchar", default: "mined" })
  source: PriorityRuleSource;

  @Column({ default: 0 })
  hitCount: number;

  /** Shadow comparisons made against this rule (Phase 3 drift detection). */
  @Column({ type: "int", default: 0 })
  shadowSampleCount: number;

  /** Of those, how many disagreed with the LLM's band. */
  @Column({ type: "int", default: 0 })
  shadowDivergenceCount: number;

  /**
   * Last time the rule's band was re-confirmed against the LLM (shadow-sample /
   * drift detection, Phase 3). Null until first re-validation.
   */
  @Column({ type: "timestamptz", nullable: true })
  lastValidatedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;
}
