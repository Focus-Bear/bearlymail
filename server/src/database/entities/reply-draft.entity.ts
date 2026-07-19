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
import { User } from "./user.entity";

@Entity("reply_drafts")
@Index(["userId", "emailThreadId"], { unique: true })
export class ReplyDraft {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string;

  @Column({ comment: "The thread ID of the email being replied to" })
  emailThreadId: string;

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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;
}
