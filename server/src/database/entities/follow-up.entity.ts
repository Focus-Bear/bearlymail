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

import { makeEncryptedColumnTransformer } from "../../encryption/encryption.helper";
import { EmailThread } from "./email-thread.entity";
import { User } from "./user.entity";

export enum FollowUpStatus {
  // Waiting for the other party to reply
  AWAITING_REPLY = "awaiting_reply",
  // Follow-up time has passed, needs action
  FOLLOW_UP_DUE = "follow_up_due",
  // Got a reply or manually marked complete
  COMPLETED = "completed",
  // User cancelled the follow-up
  CANCELLED = "cancelled",
}

@Entity("follow_ups")
@Index(["userId", "status"])
@Index(["userId", "followUpDueAt"])
export class FollowUp {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  @Column({ comment: "Gmail thread ID" })
  threadId: string;

  @Column({ nullable: true, comment: "FK to email_threads" })
  emailThreadId: string;

  @ManyToOne(() => EmailThread)
  @JoinColumn({ name: "emailThreadId" })
  emailThread: EmailThread;

  @Column({
    nullable: true,
    comment: "The email ID that was sent (triggering the follow-up)",
  })
  sentEmailId: string;

  @Column({
    type: "varchar",
    default: FollowUpStatus.AWAITING_REPLY,
  })
  status: FollowUpStatus;

  // When the user expects a reply by
  @Column()
  followUpDueAt: Date;

  // Number of days user set for follow-up
  @Column()
  followUpDays: number;

  // Last email from the other party (for context in follow-up drafts)
  @Column("text", {
    nullable: true,
    transformer: makeEncryptedColumnTransformer("follow_ups.lastTheirReply"),
  })
  lastTheirReply: string;

  @Column({
    nullable: true,
    transformer: makeEncryptedColumnTransformer(
      "follow_ups.lastTheirReplyFrom",
    ),
  })
  lastTheirReplyFrom: string;

  @Column({ nullable: true })
  lastTheirReplyAt: Date;

  // Last email from the user (for context in follow-up drafts)
  @Column("text", {
    nullable: true,
    transformer: makeEncryptedColumnTransformer("follow_ups.lastMyReply"),
  })
  lastMyReply: string;

  @Column({ nullable: true })
  lastMyReplyAt: Date;

  // Generated follow-up draft (can be edited by user)
  @Column("text", {
    nullable: true,
    transformer: makeEncryptedColumnTransformer("follow_ups.draftFollowUp"),
  })
  draftFollowUp: string;

  // Subject line for the thread
  @Column({
    nullable: true,
    transformer: makeEncryptedColumnTransformer("follow_ups.subject"),
  })
  subject: string;

  // Generation status tracking
  @Column({ type: "varchar", nullable: true })
  generationStatus: "pending" | "generating" | "completed" | "error" | null;

  @Column("text", {
    nullable: true,
    transformer: makeEncryptedColumnTransformer("follow_ups.generationError"),
  })
  generationError: string | null;

  @Column({ nullable: true })
  generatedAt: Date | null;

  // Send status tracking
  @Column({ type: "varchar", nullable: true })
  sendStatus: "pending" | "sending" | "sent" | "failed" | null;

  @Column("text", {
    nullable: true,
    transformer: makeEncryptedColumnTransformer("follow_ups.sendError"),
  })
  sendError: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
