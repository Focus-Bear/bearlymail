import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  Index,
} from "typeorm";
import { User } from "./user.entity";
import { encryptedColumnTransformer } from "../../encryption/encryption.helper";

@Entity("reply_drafts")
@Index(["userId", "emailThreadId"], { unique: true })
export class ReplyDraft {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string;

  @Column({ comment: "The thread ID of the email being replied to" })
  emailThreadId: string;

  @Column("text", { transformer: encryptedColumnTransformer })
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
    transformer: encryptedColumnTransformer,
    comment: "Comma-separated list of recipients",
  })
  recipients: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: "userId" })
  user: User;
}
