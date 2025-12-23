import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { User } from "./user.entity";
import { encryptedJsonTransformer } from "../../encryption/encryption.helper";

/**
 * Tracks context analysis runs for users.
 * Each analysis run processes email threads and generates context insights.
 * This table allows multiple server instances to track progress independently.
 */
@Entity("context_analyses")
@Index(["userId", "status"]) // For querying active analyses
@Index(["userId", "createdAt"]) // For querying recent analyses
export class ContextAnalysis {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  userId: string;

  @Column({
    type: "enum",
    enum: ["pending", "running", "completed", "failed"],
    default: "pending",
  })
  status: "pending" | "running" | "completed" | "failed";

  @Column({ nullable: true })
  progress: number; // 0-100

  @Column({ nullable: true })
  total: number; // Total steps (usually 100)

  @Column({ nullable: true })
  threadCount: number; // Total threads being analyzed

  @Column({ nullable: true })
  analyzedCount: number; // How many threads analyzed so far

  @Column({ type: "jsonb", nullable: true, transformer: encryptedJsonTransformer })
  stats: {
    totalThreads: number;
    outboundEmails: number;
    threadsNeverOpened: number;
    threadsReadButNotReplied: number;
    vipContactsEvaluated: number;
  } | null; // Final analysis statistics

  @Column("text", { nullable: true })
  errorMessage: string | null; // Error message if status is "failed"

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: "userId" })
  user: User;
}

