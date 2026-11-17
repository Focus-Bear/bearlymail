import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";

import { makeEncryptedJsonTransformer } from "../../encryption/encryption.helper";
import { User } from "./user.entity";

/**
 * An Ask AI connected-tool call waiting for the user's approval. Holds the
 * paused agent conversation so the turn can resume once the user approves or
 * denies. Single-use (deleted when consumed) and short-lived (`expiresAt`).
 */
@Entity("ask_ai_pending_approvals")
@Index(["userId", "expiresAt"])
export class AskAiPendingApproval {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid" })
  userId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  /** Hex SHA-256 over the server, tool and canonical arguments that will run. */
  @Column({ type: "varchar" })
  argumentsHash: string;

  /** The paused agent state: conversation, pending call and remaining calls. */
  @Column({
    type: "text",
    transformer: makeEncryptedJsonTransformer("ask_ai_pending_approvals.state"),
  })
  state: unknown;

  @Column({ type: "timestamptz" })
  expiresAt: Date;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;
}
