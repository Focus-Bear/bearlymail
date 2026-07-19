import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { makeEncryptedColumnTransformer } from "../../encryption/encryption.helper";
import {
  WorkflowAction,
  WorkflowCondition,
} from "../../workflows/types/workflow.types";
import { User } from "./user.entity";

/**
 * WorkflowRule — user-defined automation rule for incoming emails.
 * Each rule has a condition (email matching) and ordered list of actions.
 *
 * Part of feature #1483 — Automated Email Workflows.
 */
@Entity("workflow_rules")
export class WorkflowRule {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "userId" })
  user: User;

  /**
   * Human-readable label, e.g. "Upwork billing → Focus Bear task".
   * Encrypted at rest.
   */
  @Column({
    type: "text",
    transformer: makeEncryptedColumnTransformer("workflow_rules.name"),
  })
  name: string;

  @Column({ type: "boolean", default: true })
  enabled: boolean;

  /**
   * Lower = higher priority. Rules are evaluated in ascending order;
   * first match wins.
   */
  @Column({ type: "int", default: 0 })
  priority: number;

  /** Email matching criteria (stored as JSONB, unencrypted — patterns only) */
  @Column({ type: "jsonb" })
  condition: WorkflowCondition;

  /** Ordered list of actions to execute when condition matches */
  @Column({ type: "jsonb" })
  actions: WorkflowAction[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
