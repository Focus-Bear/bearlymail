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
  makeEncryptedColumnTransformer,
  makeEncryptedJsonTransformer,
} from "../../encryption/encryption.helper";
import { Email } from "./email.entity";
import { User } from "./user.entity";

@Entity("action_items")
// For querying active tasks
@Index(["userId", "isCompleted"])
// For cache invalidation checks
@Index(["userId", "emailThreadId", "lastEmailId", "source"])
export class ActionItem {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string;

  @Column({ nullable: true })
  emailId: string;

  @Column({ nullable: true })
  emailThreadId: string;
  // Denormalized for easy thread access

  @Column("text", {
    transformer: makeEncryptedColumnTransformer("action_items.description"),
  })
  description: string;

  @Column({ default: false })
  isCompleted: boolean;

  @Column({ type: "text", default: "user" })
  // 'user' or 'llm'
  source: string;

  @Column({ type: "float", nullable: true })
  confidenceScore: number;
  // For LLM suggestions

  @Column({
    nullable: true,
    comment:
      "Action type for suggested actions (e.g., 'github_update_status', 'calendar_create_invite'). NULL for regular action items.",
  })
  actionType: string | null;

  @Column({
    type: "text",
    nullable: true,
    transformer: makeEncryptedColumnTransformer("action_items.reason"),
    comment: "Explanation/reason for suggested actions",
  })
  reason: string | null;

  @Column({
    type: "text",
    nullable: true,
    transformer: makeEncryptedJsonTransformer("action_items.metadata"),
    comment: "Action-specific metadata (e.g., GitHub issue info)",
  })
  metadata: Record<string, unknown> | null;

  @Column({
    type: "uuid",
    nullable: true,
    comment:
      "ID of the last email used for LLM generation of suggested actions",
  })
  lastEmailId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  @ManyToOne(() => Email)
  @JoinColumn({ name: "emailId" })
  email: Email;
}
