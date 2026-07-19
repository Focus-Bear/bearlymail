/**
 * Client-side type definitions for automated email workflows.
 * Mirrors server-side workflow.types.ts (not imported to avoid circular deps).
 *
 * Part of feature #1483 — Automated Email Workflows.
 */

export type WorkflowPriorityLevel = 'veryHigh' | 'high' | 'medium' | 'low' | 'veryLow';

export interface WorkflowCondition {
  fromPatterns: string[];
  subjectPatterns: string[];
  categories?: string[];
  priorityLevels?: WorkflowPriorityLevel[];
  naturalLanguageCondition?: string | null;
}

export interface WorkflowActionBase {
  type: string;
  label?: string;
}

export interface WorkflowActionReply extends WorkflowActionBase {
  type: 'reply';
  templateBody: string;
}

export interface WorkflowActionMCPTool extends WorkflowActionBase {
  type: 'mcp_tool';
  serverId: string;
  toolName: string;
  parameters: Record<string, string>;
}

export interface WorkflowActionWebhook extends WorkflowActionBase {
  type: 'webhook';
  url: string;
  method: 'POST' | 'PUT';
  headers?: Record<string, string>;
  bodyTemplate: string;
}

/** Archives the matched email's thread. Takes no configuration. */
export interface WorkflowActionArchive extends WorkflowActionBase {
  type: 'archive';
}

export type WorkflowAction =
  | WorkflowActionReply
  | WorkflowActionMCPTool
  | WorkflowActionWebhook
  | WorkflowActionArchive;

export interface WorkflowRule {
  id: string;
  userId: string;
  name: string;
  enabled: boolean;
  priority: number;
  condition: WorkflowCondition;
  actions: WorkflowAction[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowExecutionLog {
  id: string;
  workflowRuleId: string;
  userId: string;
  emailThreadId: string;
  status: 'pending' | 'running' | 'success' | 'partial_failure' | 'failed';
  actionResults: Array<{
    actionIndex: number;
    status: 'success' | 'failed' | 'skipped';
    output?: unknown;
    error?: string;
    durationMs: number;
  }> | null;
  resolvedVariables: Record<string, string> | null;
  executedAt: string;
}

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: object;
}

export type MCPServerPurpose = 'workflow' | 'sender_context' | 'ask_ai';

export const MCP_AUTH_TYPES = { NONE: 'none', BEARER: 'bearer', OAUTH: 'oauth' } as const;

export type MCPAuthType = (typeof MCP_AUTH_TYPES)[keyof typeof MCP_AUTH_TYPES];

export interface MCPServerConfig {
  id: string;
  userId: string;
  name: string;
  serverUrl: string;
  apiKey?: string | null;
  purpose: MCPServerPurpose;
  authType?: MCPAuthType;
  cachedTools: MCPToolDefinition[] | null;
  toolsCachedAt: string | null;
  enabled: boolean;
  createdAt: string;
}

// ── Form types ────────────────────────────────────────────────────────────────

export interface WorkflowRuleFormValues {
  name: string;
  enabled: boolean;
  condition: WorkflowCondition;
  actions: WorkflowAction[];
}
