import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { Email } from "./email.entity";
import { User } from "./user.entity";

export enum OverrideReasonType {
  WRONG_SENDER_PRIORITY = "wrong_sender_priority",
  WRONG_URGENCY = "wrong_urgency",
  TOPIC_MISMATCH = "topic_mismatch",
  OTHER = "other",
}

@Entity("priority_overrides")
@Index(["userId", "emailId"])
@Index(["emailId"])
@Index(["userId", "createdAt"])
export class PriorityOverride {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  emailId: string;

  @Column()
  userId: string;

  @Column({ type: "float" })
  originalPriorityScore: number;

  @Column({ type: "float" })
  userPriorityScore: number;

  @Column({
    type: "enum",
    enum: OverrideReasonType,
    default: OverrideReasonType.OTHER,
  })
  reasonType: OverrideReasonType;

  @Column("text", { nullable: true, comment: "Free-form explanation" })
  reasonText: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  @ManyToOne(() => Email)
  @JoinColumn({ name: "emailId" })
  email: Email;
}
