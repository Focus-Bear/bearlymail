import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { AutoResponseLogPriority } from "../../auto-responder/types/auto-responder.types";
import {
  makeEncryptedColumnTransformer,
  makeEncryptedJsonTransformer,
} from "../../encryption/encryption.helper";
import { EmailThread } from "./email-thread.entity";
import { User } from "./user.entity";

@Entity("auto_response_logs")
@Index(["userId", "sentAt"])
@Index(["userId", "emailThreadId"])
@Index(["userId", "senderEmailHash"])
export class AutoResponseLog {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  userId: string;

  @Column({ type: "uuid", nullable: true })
  emailThreadId: string | null;

  @Column({
    comment: "SHA-256 hash of sender email for querying",
  })
  senderEmailHash: string;

  @Column({
    type: "enum",
    enum: AutoResponseLogPriority,
    default: AutoResponseLogPriority.MEDIUM,
  })
  priorityLevel: AutoResponseLogPriority;

  @Column({
    default: false,
    comment: "Whether a Q&A answer was included",
  })
  qaAnswerProvided: boolean;

  @Column({
    type: "float",
    nullable: true,
    comment: "Confidence score of the Q&A answer (0-1)",
  })
  confidenceScore: number | null;

  @Column({
    comment:
      "Template type used (standard, highPriority, lowPriority, zeroBacklog)",
  })
  templateUsed: string;

  @Column({
    type: "text",
    nullable: true,
    transformer: makeEncryptedColumnTransformer(
      "auto_response_logs.responseSubject",
    ),
    comment: "The subject line used in the auto-response",
  })
  responseSubject: string | null;

  @Column({
    type: "text",
    nullable: true,
    transformer: makeEncryptedColumnTransformer(
      "auto_response_logs.responseBody",
    ),
    comment: "The body of the auto-response sent",
  })
  responseBody: string | null;

  @Column({
    type: "text",
    nullable: true,
    transformer: makeEncryptedJsonTransformer(
      "auto_response_logs.classificationDetails",
    ),
    comment: "Classification details for debugging",
  })
  classificationDetails: {
    isAutomated: boolean;
    isNewsletter: boolean;
    isColdOutreach: boolean;
    personalizationScore: number;
    reasons: string[];
  } | null;

  @Column({
    default: false,
    comment: "Whether the sender replied requesting escalation",
  })
  escalationRequested: boolean;

  @Column({
    nullable: true,
    comment: "When escalation was requested",
  })
  escalationRequestedAt: Date | null;

  @CreateDateColumn()
  sentAt: Date;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  @ManyToOne(() => EmailThread, { nullable: true })
  @JoinColumn({ name: "emailThreadId" })
  emailThread: EmailThread | null;
}
