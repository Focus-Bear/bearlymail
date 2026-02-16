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
import { SuppressionReason } from "../../auto-responder/types/auto-responder.types";

@Entity("auto_response_suppressions")
@Index(["userId", "senderEmailHash"])
@Index(["userId", "suppressUntil"])
export class AutoResponseSuppression {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  userId: string;

  @Column({
    comment: "SHA-256 hash of sender email for querying",
  })
  senderEmailHash: string;

  @Column({
    type: "enum",
    enum: SuppressionReason,
    default: SuppressionReason.COOLDOWN,
  })
  reason: SuppressionReason;

  @Column({
    nullable: true,
    comment: "When suppression expires (null = permanent for opt-outs)",
  })
  suppressUntil: Date | null;

  @Column({
    type: "text",
    nullable: true,
    comment: "Additional notes about the suppression",
  })
  notes: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;
}
