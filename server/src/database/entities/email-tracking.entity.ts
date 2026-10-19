import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from "typeorm";

import {
  EmailTrackingStatus,
  TrackedSendSource,
  UntrackedReason,
} from "../../constants/email-tracking.constants";
import { makeEncryptedColumnTransformer } from "../../encryption/encryption.helper";
import { EmailOpenEvent } from "./email-open-event.entity";
import { User } from "./user.entity";

/**
 * One user-originated outbound message and what we know about it being opened.
 *
 * A row is written for every message that goes through TrackedEmailSender —
 * untracked ones too (with `untrackedReason`), so stats can say how much of the
 * user's mail was actually measurable. Only tracked rows carry a `token`, the
 * unguessable id embedded in the pixel URL; the email id never leaves the server.
 *
 * Open aggregates are denormalised here so the pixel hit is one UPDATE and the
 * inbox/stats reads never touch the event table.
 */
@Entity("email_trackings")
@Index("IDX_email_trackings_user_sent", ["userId", "sentAt"])
@Index("IDX_email_trackings_user_thread", ["userId", "threadId"])
@Index("IDX_email_trackings_user_message", ["userId", "messageId"])
export class EmailTracking {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string;

  /** Pixel token (128 random bits, base64url). Null for untracked sends. */
  @Index("IDX_email_trackings_token", { unique: true })
  @Column({ type: "varchar", length: 32, nullable: true })
  token: string | null;

  @Column({ type: "varchar", length: 20 })
  status: EmailTrackingStatus;

  @Column({ type: "varchar", length: 30, nullable: true })
  untrackedReason: UntrackedReason | null;

  @Column({ type: "varchar", length: 20 })
  source: TrackedSendSource;

  /** Provider message id returned by the send. */
  @Column({ type: "text", nullable: true })
  messageId: string | null;

  /** Provider thread id returned by the send. */
  @Column({ type: "text", nullable: true })
  threadId: string | null;

  /** Comma-separated To/Cc/Bcc addresses (encrypted). Null when untracked. */
  @Column({
    type: "text",
    nullable: true,
    transformer: makeEncryptedColumnTransformer("email_trackings.recipients"),
  })
  recipients: string | null;

  /** With several recipients an open can't be attributed to one person. */
  @Column({ type: "int", default: 0 })
  recipientCount: number;

  @Column({ type: "timestamptz" })
  sentAt: Date;

  /** Reliable opens (direct or via Gmail's proxy), deduplicated. */
  @Column({ type: "int", default: 0 })
  openCount: number;

  @Column({ type: "timestamptz", nullable: true })
  firstOpenedAt: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  lastOpenedAt: Date | null;

  /** Apple Mail Privacy Protection prefetches — shown as "may be automatic". */
  @Column({ type: "int", default: 0 })
  automaticOpenCount: number;

  @Column({ type: "timestamptz", nullable: true })
  lastAutomaticOpenAt: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({
    name: "userId",
    foreignKeyConstraintName: "FK_email_trackings_user",
  })
  user: User;

  @OneToMany(() => EmailOpenEvent, (event) => event.tracking)
  openEvents: EmailOpenEvent[];
}
