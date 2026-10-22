import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";

import type {
  ArchiveRuleCondition,
  ProposalEvidence,
} from "../../auto-archive-proposals/auto-archive-proposals.types";
import type {
  AutoArchiveProposalStatus,
  AutoArchiveSenderScope,
} from "../../constants/auto-archive-proposal.constants";
import {
  makeEncryptedColumnTransformer,
  makeEncryptedJsonTransformer,
} from "../../encryption/encryption.helper";
import { User } from "./user.entity";

/**
 * A proposed "from <sender> AND <keywords> → archive" rule, mined from the
 * user's own engagement with a heavy sender. Never applied on its own: approval
 * turns it into an ordinary archive WorkflowRule; dismissal is remembered so
 * the same rule is not proposed again.
 */
@Entity("auto_archive_proposals")
@Index(["userId", "status"])
@Unique(["userId", "conditionKey"])
export class AutoArchiveProposal {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  userId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  /** Address HMAC or domain-group key; groups proposals by sender. */
  @Column({ type: "varchar", length: 128 })
  senderKey: string;

  /** Address HMACs whose mail the sender group covers (one for an address group). */
  @Column({ type: "jsonb", default: () => "'[]'" })
  memberSenderKeys: string[];

  @Column({ type: "varchar", length: 16 })
  scope: AutoArchiveSenderScope;

  @Column({ type: "varchar", length: 16, default: "pending" })
  status: AutoArchiveProposalStatus;

  /** Deterministic HMAC of the mined condition — dedupes re-runs without decrypting. */
  @Column({ type: "varchar", length: 128 })
  conditionKey: string;

  @Column("text", {
    transformer: makeEncryptedColumnTransformer(
      "auto_archive_proposals.senderDisplay",
    ),
  })
  senderDisplay: string;

  /** The rule as mined, or as edited when approved. */
  @Column("text", {
    transformer: makeEncryptedJsonTransformer(
      "auto_archive_proposals.condition",
    ),
  })
  condition: ArchiveRuleCondition;

  /** Simulation results and sample subjects shown to the user. */
  @Column("text", {
    transformer: makeEncryptedJsonTransformer(
      "auto_archive_proposals.evidence",
    ),
  })
  evidence: ProposalEvidence;

  /** The workflow created on approval. */
  @Column({ type: "uuid", nullable: true })
  workflowRuleId: string | null;

  @Column({ type: "timestamptz", nullable: true })
  respondedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
