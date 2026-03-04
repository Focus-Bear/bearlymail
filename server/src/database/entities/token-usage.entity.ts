import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { User } from "./user.entity";

/**
 * Tracks token usage for LLM API calls.
 * Each record represents a single LLM API call with its token consumption.
 */
@Entity("token_usage")
// For aggregating usage by operation
@Index(["operation", "createdAt"])
// For filtering by user
@Index(["userId", "createdAt"])
// For filtering by provider
@Index(["provider", "createdAt"])
export class TokenUsage {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  // Nullable for system-level calls (no specific user)
  @Column({ type: "uuid", nullable: true })
  userId: string | null;

  // The operation type (e.g., "summarize_email", "generate_reply")
  @Column({ type: "varchar", length: 100 })
  operation: string;

  // LLM provider (e.g., "openai", "gemini")
  @Column({ type: "varchar", length: 50 })
  provider: string;

  // Model used (e.g., "gpt-4", "gemini-1.5-flash")
  @Column({ type: "varchar", length: 100 })
  model: string;

  // Number of tokens in the prompt
  @Column({ type: "int", default: 0 })
  promptTokens: number;

  // Number of tokens in the completion
  @Column({ type: "int", default: 0 })
  completionTokens: number;

  // Total tokens (prompt + completion)
  @Column({ type: "int", default: 0 })
  totalTokens: number;

  // Duration of the API call in milliseconds
  @Column({ type: "int", nullable: true })
  durationMs: number | null;

  // Whether the input prompt contained HTML content
  @Column({ type: "boolean", default: false })
  containsHtml: boolean;

  // Email IDs processed in this LLM call (for tracking duplicate summarizations)
  // Stored as JSON array of email IDs
  @Column({ type: "jsonb", nullable: true })
  emailIds: string[] | null;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "userId" })
  user: User | null;
}
