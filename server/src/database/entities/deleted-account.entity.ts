import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from "typeorm";

export enum DeletionReason {
  MANUAL = "manual",
  INACTIVITY = "inactivity",
}

/**
 * Stores a minimal record of deleted accounts so that returning users
 * can be shown a helpful "your data was deleted" message rather than a
 * generic "invalid credentials" error.
 *
 * Only non-PII fields are stored:
 * - emailHash: SHA-256 of the email (same algorithm used in the users table)
 * - passwordHash: the bcrypt hash from the users table (not plaintext)
 * - deletedAt / deletionReason: for auditing and message personalisation
 *
 * Records are kept for 90 days, after which the cron cleanup removes them.
 */
@Entity("deleted_accounts")
export class DeletedAccount {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true })
  @Index()
  emailHash: string;

  @Column({ nullable: true })
  passwordHash: string;

  @Column({
    type: "enum",
    enum: DeletionReason,
    default: DeletionReason.MANUAL,
  })
  deletionReason: DeletionReason;

  @CreateDateColumn()
  deletedAt: Date;
}
