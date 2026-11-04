import { Injectable, Logger } from "@nestjs/common";

import {
  JSON_RPC_ERROR_CODES,
  MCP_TOOL_NAMES,
  McpToolName,
} from "../constants/mcp-server.constants";
import { PatScope } from "../constants/personal-access-tokens.constants";
import { McpReadToolsService } from "./mcp-read-tools.service";
import { McpSendToolsService } from "./mcp-send-tools.service";
import {
  JsonRpcError,
  McpCallContext,
  McpCallToolResult,
} from "./mcp-server.types";
import {
  findToolSpec,
  McpToolDefinition,
  toolsForScopes,
} from "./mcp-server-tool-definitions";
import { McpToolInputError, ToolArgs } from "./mcp-tool-args";

type ToolHandler = (
  context: McpCallContext,
  args: ToolArgs,
) => Promise<unknown>;

const GENERIC_TOOL_FAILURE =
  "BearlyMail couldn't complete this request. Try again shortly.";

function textResult(value: unknown): McpCallToolResult {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return { content: [{ type: "text", text }] };
}

function errorResult(message: string): McpCallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

/**
 * Lists and runs the MCP tools a token's scopes allow. Bad arguments and
 * missing scopes come back as tool errors (`isError`) the model can read and
 * act on; only an unknown tool name is a protocol error.
 */
@Injectable()
export class McpServerToolsService {
  private readonly logger = new Logger(McpServerToolsService.name);
  private readonly handlers: Record<McpToolName, ToolHandler>;

  constructor(readTools: McpReadToolsService, sendTools: McpSendToolsService) {
    this.handlers = {
      [MCP_TOOL_NAMES.LIST_IMPORTANT_EMAILS]: (context, args) =>
        readTools.listImportantEmails(context.principal.userId, args),
      [MCP_TOOL_NAMES.GET_THREAD]: (context, args) =>
        readTools.getThread(context.principal.userId, args),
      [MCP_TOOL_NAMES.SEARCH_EMAILS]: (context, args) =>
        readTools.searchEmails(context.principal.userId, args),
      [MCP_TOOL_NAMES.LIST_FOLLOW_UPS]: (context) =>
        readTools.listFollowUps(context.principal.userId),
      [MCP_TOOL_NAMES.SEND_REPLY]: (context, args) =>
        sendTools.sendReply(context, args),
      [MCP_TOOL_NAMES.SEND_EMAIL]: (context, args) =>
        sendTools.sendEmail(context, args),
    };
  }

  listTools(scopes: readonly PatScope[]): McpToolDefinition[] {
    return toolsForScopes(scopes);
  }

  async callTool(
    context: McpCallContext,
    name: string,
    args: ToolArgs,
  ): Promise<McpCallToolResult> {
    const spec = findToolSpec(name);
    if (!spec) {
      throw new JsonRpcError(
        JSON_RPC_ERROR_CODES.INVALID_PARAMS,
        `Unknown tool: ${name}`,
      );
    }
    if (!context.principal.scopes.includes(spec.requiredScope)) {
      return errorResult(
        `This BearlyMail access token doesn't have the "${spec.requiredScope}" permission. The user can create a token with it in BearlyMail Settings.`,
      );
    }
    try {
      return textResult(await this.handlers[spec.name](context, args));
    } catch (error: unknown) {
      if (error instanceof McpToolInputError) {
        return errorResult(error.message);
      }
      this.logger.error(
        `MCP tool ${spec.name} failed for user ${context.principal.userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return errorResult(GENERIC_TOOL_FAILURE);
    }
  }
}
