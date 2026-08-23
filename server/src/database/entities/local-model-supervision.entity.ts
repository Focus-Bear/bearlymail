import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { makeEncryptedColumnTransformer } from "../../encryption/encryption.helper";

/**
 * Per-user, per-category state for the adaptive LLM-supervision of the local
 * category model. One row per category the user has; `sampleRatePercent` is the
 * current share of that category's confident predictions we divert to the LLM
 * to score, and the `window*` counters accumulate the current measurement
 * window (see local-model-supervision.constants.ts / .service.ts).
 */
@Entity("local_model_supervision")
@Index(["userId", "categoryHash"], { unique: true })
export class LocalModelSupervision {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string;

  /** SHA-256 of the normalised category name — the queryable/unique key. */
  @Column()
  categoryHash: string;

  /** Encrypted plaintext category name, kept only for admin/debug readability. */
  @Column({
    transformer: makeEncryptedColumnTransformer(
      "local_model_supervision.category",
    ),
  })
  category: string;

  /** Current supervision rate for this category (percent, one of the stages). */
  @Column({ type: "int", default: 50 })
  sampleRatePercent: number;

  /** Supervised decisions recorded in the current (not-yet-evaluated) window. */
  @Column({ type: "int", default: 0 })
  windowSamples: number;

  /** Of those, how many where the local category matched the LLM's. */
  @Column({ type: "int", default: 0 })
  windowAgreements: number;

  /** Lifetime supervised decisions (never reset) — powers the admin accuracy view. */
  @Column({ type: "int", default: 0 })
  lifetimeSamples: number;

  /** Of the lifetime samples, how many the local category matched the LLM's. */
  @Column({ type: "int", default: 0 })
  lifetimeAgreements: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
