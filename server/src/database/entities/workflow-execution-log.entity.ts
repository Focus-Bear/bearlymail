import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from "typeorm";

import {
  WorkflowActionResult,
  WorkflowExecutionStatus,
} from "../../workflows/types/workflow.types";

/**
 * WorkflowExecutionLog — full audit trail of every workflow execution.
 *
 * Part of feature #1483 — Automated Email Workflows.
 */
@Entity("workflow_execution_logs")
export class WorkflowExecutionLog {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  workflowRuleId: string;

  @Column()
  userId: string;

  @Column()
  emailThreadId: string;

  @Column({ type: "varchar", length: 20 })
  status: WorkflowExecutionStatus;

  @Column({ type: "jsonb", nullable: true })
  actionResults: WorkflowActionResult[] | null;

  /** Resolved template variables — stored for debugging / audit */
  @Column({ type: "jsonb", nullable: true })
  resolvedVariables: Record<string, string> | null;

  @CreateDateColumn()
  executedAt: Date;
}
