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

import { makeEncryptedJsonTransformer } from "../../encryption/encryption.helper";
import { User } from "./user.entity";

@Entity("suggested_replies")
@Index(["userId", "emailThreadId"], { unique: true })
export class SuggestedReply {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string;

  @Column({
    comment: "The thread ID of the email for which replies are suggested",
  })
  emailThreadId: string;

  @Column({
    type: "text",
    transformer: makeEncryptedJsonTransformer("suggested_replies.options"),
    comment: "Array of suggested reply options with label and text",
  })
  options: Array<{ label: string; text: string }>;

  @Column({
    nullable: true,
    comment: "The email ID that was used to generate these suggestions",
  })
  lastEmailId: string | null;

  @Column({
    default: false,
    comment: "Flag to indicate suggestions are being generated",
  })
  isGenerating: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;
}
