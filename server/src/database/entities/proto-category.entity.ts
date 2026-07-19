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

import {
  makeEncryptedColumnTransformer,
  makeEncryptedJsonTransformer,
} from "../../encryption/encryption.helper";
import { User } from "./user.entity";

/**
 * A category name the dedup pass considered as a possible duplicate of this
 * proto category, along with the LLM's verdict and reasoning. Recorded when
 * the proto category is created and again when it is promoted, so the UI can
 * explain why it was kept separate from existing categories.
 */
export interface ConsideredDuplicateCandidate {
  name: string;
  isDuplicate: boolean;
  reasoning: string;
}

/**
 * ProtoCategory represents a proposed category that hasn't been promoted to a real category yet.
 * When an email doesn't match any existing category or proto category, a new proto category is suggested.
 * Once a proto category reaches the promotion threshold (PROMOTION_THRESHOLD emails assigned),
 * it gets promoted to a real category (UserContext with EMAIL_CATEGORY key).
 */
@Entity("proto_categories")
@Index(["userId", "isPromoted"])
@Index(["userId", "name"], { unique: true })
export class ProtoCategory {
  // Number of emails needed to promote proto category to real category
  static readonly PROMOTION_THRESHOLD = 5;

  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  userId: string;

  @Column("text", {
    transformer: makeEncryptedColumnTransformer("proto_categories.name"),
    comment: "Proto category name (e.g., '🔧 Technical Issues')",
  })
  name: string;

  @Column("text", {
    nullable: true,
    transformer: makeEncryptedColumnTransformer("proto_categories.description"),
    comment: "Description of what emails belong in this proto category",
  })
  description: string | null;

  @Column({
    type: "int",
    default: 1,
    comment: "Number of emails assigned to this proto category",
  })
  emailCount: number;

  @Column({
    default: false,
    comment: "Whether this proto category has been promoted to a real category",
  })
  isPromoted: boolean;

  @Column({
    type: "uuid",
    nullable: true,
    comment:
      "ID of the UserContext created when this proto category was promoted",
  })
  promotedCategoryId: string | null;

  @Column({
    type: "timestamptz",
    nullable: true,
    comment: "When this proto category was promoted to a real category",
  })
  promotedAt: Date | null;

  @Column("text", {
    nullable: true,
    transformer: makeEncryptedColumnTransformer(
      "proto_categories.promotionReasoning",
    ),
    comment:
      "Human-readable rationale for why this proto category was promoted",
  })
  promotionReasoning: string | null;

  @Column("text", {
    nullable: true,
    transformer: makeEncryptedJsonTransformer(
      "proto_categories.duplicateCandidates",
    ),
    comment:
      "Existing categories the dedup pass considered, with the LLM verdict and " +
      "reasoning for why they were (not) treated as duplicates. Encrypted JSON.",
  })
  duplicateCandidates: ConsideredDuplicateCandidate[] | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;
}
