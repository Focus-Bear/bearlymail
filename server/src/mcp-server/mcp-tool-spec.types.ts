import { McpToolName } from "../constants/mcp-server.constants";
import { PatScope } from "../constants/personal-access-tokens.constants";

/** MCP tool annotations (hints the client uses to decide when to confirm). */
interface McpToolAnnotations {
  title: string;
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

export interface McpToolDefinition {
  name: McpToolName;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: McpToolAnnotations;
}

export interface McpToolSpec extends McpToolDefinition {
  requiredScope: PatScope;
}

export const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;
