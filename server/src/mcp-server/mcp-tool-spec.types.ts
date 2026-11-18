import { McpToolName } from "../constants/mcp-server.constants";
import {
  PAT_SCOPES,
  PatScope,
} from "../constants/personal-access-tokens.constants";

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
  /** A token needs at least one of these scopes to see and call the tool. */
  allowedScopes: readonly PatScope[];
}

export const READ_SCOPES = [PAT_SCOPES.MAIL_READ] as const;

export const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;
