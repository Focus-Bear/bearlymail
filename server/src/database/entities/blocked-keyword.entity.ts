import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { User } from "./user.entity";
import { encryptedColumnTransformer } from "../../encryption/encryption.helper";

/**
 * Blocked keywords - emails with these keywords in subject lines are automatically archived
 * and labeled "BearlyMail-Blocked", and excluded from summaries.
 */
@Entity("blocked_keywords")
// One keyword per user (unique constraint)
@Index(["userId", "keywordHash"], { unique: true })
export class BlockedKeyword {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string;

  // Encrypted keyword
  @Column({ transformer: encryptedColumnTransformer })
  keyword: string;

  // Hash for fast lookups (SHA-256 of lowercase keyword)
  @Column()
  keywordHash: string;

  // Whether to match as exact phrase or partial match
  @Column({ default: false })
  exactMatch: boolean;

  // Why the user blocked this keyword (optional)
  @Column({ nullable: true, transformer: encryptedColumnTransformer })
  reason: string;

  @CreateDateColumn()
  blockedAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: "userId" })
  user: User;
}
