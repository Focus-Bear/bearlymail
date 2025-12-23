import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
  JoinColumn,
  Index,
} from "typeorm";
import { User } from "./user.entity";
import { Email } from "./email.entity";

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

  @Column("text", { nullable: true })
  reasonText: string | null; // Free-form explanation

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: "userId" })
  user: User;

  @ManyToOne(() => Email)
  @JoinColumn({ name: "emailId" })
  email: Email;
}


