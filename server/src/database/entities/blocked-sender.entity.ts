import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { makeEncryptedColumnTransformer } from "../../encryption/encryption.helper";
import { User } from "./user.entity";

/**
 * Blocked senders - emails from these addresses are automatically archived
 * and labeled "BearlyMail-Blocked", and excluded from summaries.
 */
@Entity("blocked_senders")
// One block per email per user
@Index(["userId", "emailHash"], { unique: true })
export class BlockedSender {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string;

  // Encrypted email address
  @Column({
    transformer: makeEncryptedColumnTransformer("blocked_senders.email"),
  })
  email: string;

  // Hash for fast lookups (SHA-256)
  @Column()
  emailHash: string;

  // Optional: block entire domain (e.g., @newsletter.example.com)
  @Column({ nullable: true })
  domainHash: string;
  // Hash of domain for domain-level blocking

  // Why the user blocked this sender (optional)
  @Column({
    nullable: true,
    transformer: makeEncryptedColumnTransformer("blocked_senders.reason"),
  })
  reason: string;

  // Name of sender (for display in settings)
  @Column({
    nullable: true,
    transformer: makeEncryptedColumnTransformer("blocked_senders.senderName"),
  })
  senderName: string;

  @CreateDateColumn()
  blockedAt: Date;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;
}
