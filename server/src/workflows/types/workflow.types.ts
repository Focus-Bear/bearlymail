/**
 * Type definitions for automated email workflow rules.
 * Part of feature #1483 — Automated Email Workflows.
 */

import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";

// ── Condition ─────────────────────────────────────────────────────────────────

export type WorkflowPriorityLevel =
  | "veryHigh"
  | "high"
  | "medium"
  | "low"
  | "veryLow";

export interface WorkflowCondition {
  /**
   * Glob, regex, or substring patterns matched against the sender address.
   * Empty array = match any sender.
   */
  fromPatterns: string[];

  /**
   * Glob, regex, or substring patterns matched against the email subject.
   * Empty array = match any subject.
   */
  subjectPatterns: string[];

  /**
   * Optional: match on category assigned by the triage pipeline.
   * Empty array = match any category.
   */
  categories?: string[];

  /**
   * Optional: match on priority range.
   * Empty array = match any priority.
   */
  priorityLevels?: WorkflowPriorityLevel[];

  /**
   * Natural-language condition evaluated by LLM when deterministic patterns
   * are insufficient (e.g. "billing summary with line items").
   * null = skip LLM check.
   */
  naturalLanguageCondition?: string | null;
}

// ── Actions ───────────────────────────────────────────────────────────────────

export interface WorkflowActionBase {
  type: string;
  /** User-facing label */
  label?: string;
}

export interface WorkflowActionReply extends WorkflowActionBase {
  type: "reply";
  /**
   * Handlebars-style template body.
   * Variables: {{subject}}, {{from}}, {{date}}, {{summary}}, {{ai:...}}
   */
  templateBody: string;
}

export interface WorkflowActionMCPTool extends WorkflowActionBase {
  type: "mcp_tool";
  /** MCP server identifier (maps to MCPServerConfig.id) */
  serverId: string;
  /** Tool name as registered in MCP (e.g. "create-task") */
  toolName: string;
  /**
   * Parameter template — values can include {{variable}} placeholders
   * and {{ai:instruction}} for AI-generated content.
   */
  parameters: Record<string, string>;
}

export interface WorkflowActionWebhook extends WorkflowActionBase {
  type: "webhook";
  url: string;
  method: "POST" | "PUT";
  headers?: Record<string, string>;
  /** JSON template with {{variables}} */
  bodyTemplate: string;
}

/**
 * Archives the matched email's thread (removes it from the inbox and syncs the
 * archive to the connected provider). Takes no configuration — used for
 * "automatically archive emails in this category" workflows.
 */
export interface WorkflowActionArchive extends WorkflowActionBase {
  type: "archive";
}

export type WorkflowAction =
  | WorkflowActionReply
  | WorkflowActionMCPTool
  | WorkflowActionWebhook
  | WorkflowActionArchive;

// ── Execution log types ───────────────────────────────────────────────────────

export type WorkflowExecutionStatus =
  | "pending"
  | "running"
  | "success"
  | "partial_failure"
  | "failed";

export interface WorkflowActionResult {
  actionIndex: number;
  status: "success" | "failed" | "skipped";
  output?: unknown;
  error?: string;
  durationMs: number;
}

// ── Context passed to variable resolver & execution service ──────────────────

export interface WorkflowContext {
  userId: string;
  emailThreadId: string;
  from: string;
  fromName: string;
  subject: string;
  date: Date;
  /** LLM-generated summary (may be empty if not yet available) */
  summary: string;
  /** Cleaned body text (truncated) */
  body: string;
  category: string;
  priority: string;
}

// ── DTOs (classes with validation decorators) ─────────────────────────────────

export class WorkflowConditionDto implements WorkflowCondition {
  @IsArray()
  @IsString({ each: true })
  fromPatterns!: string[];

  @IsArray()
  @IsString({ each: true })
  subjectPatterns!: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  categories?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  priorityLevels?: WorkflowPriorityLevel[];

  @IsString()
  @IsOptional()
  naturalLanguageCondition?: string | null;
}

export class CreateWorkflowRuleDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsNumber()
  @IsOptional()
  priority?: number;

  @ValidateNested()
  @Type(() => WorkflowConditionDto)
  condition!: WorkflowConditionDto;

  @IsArray()
  actions!: WorkflowAction[];
}

export class UpdateWorkflowRuleDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsNumber()
  @IsOptional()
  priority?: number;

  @ValidateNested()
  @Type(() => WorkflowConditionDto)
  @IsOptional()
  condition?: WorkflowConditionDto;

  @IsArray()
  @IsOptional()
  actions?: WorkflowAction[];
}

export class ReorderWorkflowRulesDto {
  /** Array of rule IDs in desired priority order (index 0 = highest priority) */
  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}

export class WorkflowPreviewDto {
  /** Rule to preview (not yet saved) */
  @ValidateNested()
  @Type(() => CreateWorkflowRuleDto)
  rule!: CreateWorkflowRuleDto;

  /** Thread ID to evaluate against */
  @IsString()
  @IsNotEmpty()
  emailThreadId!: string;
}

export interface WorkflowExecutionResult {
  matched: boolean;
  ruleId?: string;
  ruleName?: string;
  status?: WorkflowExecutionStatus;
  actionResults?: WorkflowActionResult[];
  resolvedVariables?: Record<string, string>;
}
