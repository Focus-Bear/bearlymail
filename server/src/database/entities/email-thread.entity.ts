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
// One thread per user
@Index(["userId", "threadId"], { unique: true })
// For inbox filtering
@Index(["userId", "starCount", "isArchived"])
// For triage/process filtering
@Index(["userId", "isArchived", "starCount"])
// For urgency-based queries
@Index(["userId", "urgencyScore"])
// For priority-based sorting
@Index(["userId", "priorityScore"])
export class EmailThread {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  userId: string;

  @Column({ comment: "Gmail thread ID" })
  threadId: string;

  @Column({
    type: "int",
    default: 0,
    comment:
      "0 = not starred, 1 = low importance, 2 = medium importance, 3 = high importance",
  })
  starCount: number;

  @Column({ default: false })
  isArchived: boolean;

  @Column({
    type: "float",
    default: 0,
    comment: "0-100 urgency score determined by LLM",
  })
  urgencyScore: number;

  @Column({
    type: "float",
    default: 0,
    nullable: true,
    comment: "Denormalized priority score for efficient sorting (calculated from priorityExplanation breakdown)",
  })
  priorityScore: number | null;

  @Column("text", {
    nullable: true,
    transformer: encryptedColumnTransformer,
    comment: "Explanation of why it's urgent",
  })
  urgencyExplanation: string | null;

  @Column("text", {
    nullable: true,
    transformer: encryptedColumnTransformer,
    comment: "User override reason",
  })
  urgencyOverrideReason: string | null;

  @Column({
    type: "text",
    nullable: true,
    transformer: encryptedJsonTransformer,
    comment: "Precomputed priority explanation (thread-level)",
  })
  priorityExplanation: {
    score: number;
    dimensions: {
      urgency: { score: number; reasons: string[] };
      goalAlignment: { score: number; reasons: string[] };
      vipContact: { score: number; reasons: string[] };
      sentiment: { score: number; type: string; reasons: string[] };
    };
    breakdown: Array<{ factor: string; value: number; description: string }>;
    calculatedAt?: string; // ISO timestamp when priority was last calculated
  } | null;

  @Column({
    default: false,
    comment: "Flag to indicate LLM priority is being calculated for this thread",
  })
  isProcessingPriority: boolean;

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
    // GitHub issue/PR metadata
  } | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

    @Column({
      type: "timestamp",
      nullable: true,
      comment: "Last time this thread was checked against Gmail",
    })
    lastCheckedAt: Date | null;

    @Column({ default: false })
    isSnoozed: boolean;

    @Column({ type: "timestamp", nullable: true })
    snoozeUntil: Date | null;

    @ManyToOne(() => User)
  @JoinColumn({ name: "userId" })
  user: User;

  @OneToMany(() => Email, (email) => email.thread)
  emails: Email[];
}
