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
  REPLY_DRAFT_SOURCES,
  ReplyDraftSource,
} from "../../constants/domain-types";
import {
  makeEncryptedColumnTransformer,
  makeEncryptedJsonTransformer,
} from "../../encryption/encryption.helper";
import { QueuedAttachment } from "./email-send-attempt.entity";
import { User } from "./user.entity";

/**
 * A saved, unsent message. Most are reply drafts (one per thread, restored into
 * the reply composer); an AI assistant can also prepare a new message, which
 * has no thread and opens in Compose. Drafts live only in BearlyMail and are
 * never sent automatically: the user reviews and sends them.
 */
@Entity("reply_drafts")
@Index(["userId", "emailThreadId"], { unique: true })
export class ReplyDraft {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string;

  @Column({
    type: "varchar",
    nullable: true,
    comment:
      "The thread ID of the email being replied to; null for a new message",
  })
  emailThreadId: string | null;

  @Column("text", {
    transformer: makeEncryptedColumnTransformer("reply_drafts.content"),
  })
  content: string;

  @Column({
    type: "varchar",
    length: 20,
    default: "reply",
    comment: "Reply mode: reply or replyAll",
  })
  replyMode: "reply" | "replyAll";

  @Column({
    type: "text",
    nullable: true,
    transformer: makeEncryptedColumnTransformer("reply_drafts.recipients"),
    comment: "Comma-separated list of recipients",
  })
  recipients: string | null;

  /** Null on a reply draft means the composer's usual "Re: …" subject. */
  @Column({
    type: "text",
    nullable: true,
    transformer: makeEncryptedColumnTransformer("reply_drafts.subject"),
  })
  subject: string | null;

  @Column({
    type: "text",
    nullable: true,
    transformer: makeEncryptedColumnTransformer("reply_drafts.cc"),
    comment: "Comma-separated list of Cc recipients",
  })
  cc: string | null;

  @Column({
    type: "text",
    nullable: true,
    transformer: makeEncryptedColumnTransformer("reply_drafts.bcc"),
    comment: "Comma-separated list of Bcc recipients",
  })
  bcc: string | null;

  /** Files to send with the draft; `content` is base64. */
  @Column({
    type: "text",
    nullable: true,
    transformer: makeEncryptedJsonTransformer("reply_drafts.attachments"),
  })
  attachments: QueuedAttachment[] | null;

  @Column({
    type: "varchar",
    length: 20,
    default: REPLY_DRAFT_SOURCES.USER,
    comment: "Who last wrote the draft: user, auto_responder or assistant",
  })
  source: ReplyDraftSource;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;
}
