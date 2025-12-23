import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  Index,
  OneToMany,
} from "typeorm";
import { User } from "./user.entity";
import { Email } from "./email.entity";
import {
  encryptedColumnTransformer,
  encryptedJsonTransformer,
} from "../../encryption/encryption.helper";

@Entity("email_threads")
@Index(["userId", "threadId"], { unique: true }) // One thread per user
@Index(["userId", "starCount", "isArchived"]) // For inbox filtering
@Index(["userId", "isArchived", "starCount"]) // For triage/process filtering
@Index(["userId", "urgencyScore"]) // For urgency-based queries
export class EmailThread {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  userId: string;

  @Column()
  threadId: string; // Gmail thread ID

  @Column({ type: "int", default: 0 })
  starCount: number; // 0 = not starred, 1 = low importance, 2 = medium importance, 3 = high importance

  @Column({ default: false })
  isArchived: boolean;

  @Column({ type: "float", default: 0 })
  urgencyScore: number; // 0-100 urgency score determined by LLM

  @Column("text", { nullable: true, transformer: encryptedColumnTransformer })
  urgencyExplanation: string | null; // Explanation of why it's urgent

  @Column("text", { nullable: true, transformer: encryptedColumnTransformer })
  urgencyOverrideReason: string | null; // User override reason

  @Column("text", { nullable: true, transformer: encryptedJsonTransformer })
  githubMetadata: {
    links: Array<{
      type: "issue" | "pr";
      repo: string;
      owner: string;
      number: number;
      url: string;
      status?: {
        state: string;
        title?: string;
        labels?: Array<{ name: string; color: string }>;
        assignees?: Array<{ login: string; avatar_url: string }>;
        project?: string;
        reviewStatus?: "approved" | "changes_requested" | "pending" | null;
        commentsCount?: number;
        mergeable?: boolean;
        merged?: boolean;
      };
      fetchedAt?: string;
    }>;
  } | null; // GitHub issue/PR metadata

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: "timestamp", nullable: true })
  lastCheckedAt: Date | null; // Last time this thread was checked against Gmail

  @ManyToOne(() => User)
  @JoinColumn({ name: "userId" })
  user: User;

  @OneToMany(() => Email, (email) => email.thread)
  emails: Email[];
}
