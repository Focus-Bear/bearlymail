import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import {
  MCP_AUTH_TYPES,
  MCPServerConfig,
  MCPToolAnnotations,
  MCPToolDefinition,
} from "../database/entities/mcp-server-config.entity";
import { MCPOAuthService } from "./mcp-oauth.service";
import { isAwaitingOAuthAuthorization } from "./mcp-server-view";
import {
  MCPAuthorizationRequiredError,
  MCPStreamableHttpClient,
} from "./mcp-streamable-http.client";

const MCP_METHODS = {
  TOOLS_LIST: "tools/list",
  TOOLS_CALL: "tools/call",
} as const;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const MS_PER_SECOND = 1000;
/** Cache TTL for the MCP tool list: 1 hour */
const TOOL_CACHE_TTL_MS = SECONDS_PER_MINUTE * MINUTES_PER_HOUR * MS_PER_SECOND;

export interface MCPConnectionTestResult {
  ok: boolean;
  toolCount: number;
  needsAuthorization: boolean;
}

interface MCPListedTool {
  name: string;
  description?: string;
  inputSchema?: object;
  annotations?: MCPToolAnnotations;
}

/**
 * Manages connections to user-configured MCP servers.
 *
 * Talks MCP Streamable HTTP via {@link MCPStreamableHttpClient}. We implement
 * the two operations needed:
 *   - tools/list  — discover available tools
 *   - tools/call  — invoke a tool with arguments
 *
 * Part of feature #1483 — Automated Email Workflows.
 */
@Injectable()
export class MCPClientManagerService {
  private readonly logger = new Logger(MCPClientManagerService.name);

  constructor(
    @InjectRepository(MCPServerConfig)
    private readonly configRepo: Repository<MCPServerConfig>,
    private readonly oauthService: MCPOAuthService,
  ) {}

  /**
   * Fetch and cache the tool list from a server.
   * Uses cached value if fresh (< 1 hour old).
   */
  async getTools(
    serverId: string,
    forceRefresh = false,
  ): Promise<MCPToolDefinition[]> {
    const config = await this.configRepo.findOne({ where: { id: serverId } });
    if (!config) throw new Error(`MCP server config not found: ${serverId}`);

    const cacheAge = config.toolsCachedAt
      ? Date.now() - config.toolsCachedAt.getTime()
      : Infinity;

    if (!forceRefresh && config.cachedTools && cacheAge < TOOL_CACHE_TTL_MS) {
      return config.cachedTools;
    }

    // Fetch fresh tool list
    const tools = await this.fetchToolList(config);
    await this.configRepo.update(serverId, {
      cachedTools: tools,
      toolsCachedAt: new Date(),
    });
    return tools;
  }

  /**
   * Invoke an MCP tool and return its output.
   */
  async callTool(
    serverId: string,
    toolName: string,
    parameters: Record<string, unknown>,
  ): Promise<unknown> {
    const config = await this.configRepo.findOne({ where: { id: serverId } });
    if (!config) throw new Error(`MCP server config not found: ${serverId}`);
    if (!config.enabled)
      throw new Error(`MCP server is disabled: ${config.name}`);

    return this.invokeToolCall(config, toolName, parameters);
  }

  /**
   * Test connectivity to an MCP server by fetching its tool list.
   * `needsAuthorization` tells the UI to offer "Sign in" instead of a bare failure.
   */
  async testConnection(serverId: string): Promise<MCPConnectionTestResult> {
    try {
      const tools = await this.getTools(serverId, true);
      return { ok: true, toolCount: tools.length, needsAuthorization: false };
    } catch (error) {
      this.logger.warn(
        `MCP connection test failed for ${serverId}: ${(error as Error).message}`,
      );
      return {
        ok: false,
        toolCount: 0,
        needsAuthorization: error instanceof MCPAuthorizationRequiredError,
      };
    }
  }

  // ── Private MCP HTTP client ─────────────────────────────────────────────────

  /**
   * Resolve the bearer credential from either the static API key or — for
   * OAuth connections — a valid (auto-refreshed) token.
   */
  private async buildAuthHeaders(
    config: MCPServerConfig,
  ): Promise<Record<string, string>> {
    if (isAwaitingOAuthAuthorization(config)) {
      throw new MCPAuthorizationRequiredError(true);
    }
    if (config.authType === MCP_AUTH_TYPES.OAUTH) {
      return {
        Authorization: `Bearer ${await this.oauthService.getValidAccessToken(config)}`,
      };
    }
    return config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {};
  }

  private async request(
    config: MCPServerConfig,
    method: string,
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const client = new MCPStreamableHttpClient(
      config.serverUrl,
      await this.buildAuthHeaders(config),
    );
    try {
      return await client.request(method, params);
    } catch (err) {
      if (err instanceof MCPAuthorizationRequiredError) {
        await this.switchToOAuthIfOffered(config, err);
      }
      throw err;
    }
  }

  /**
   * A keyless connection whose server answers with an RFC 9728 OAuth challenge
   * (e.g. Zoho MCP) can only work through the OAuth flow. Flip it to OAuth so
   * the settings UI offers "Sign in" rather than failing forever.
   */
  private async switchToOAuthIfOffered(
    config: MCPServerConfig,
    err: MCPAuthorizationRequiredError,
  ): Promise<void> {
    const isKeylessNonOAuth =
      config.authType !== MCP_AUTH_TYPES.OAUTH && !config.apiKey;
    if (!err.supportsOAuth || !isKeylessNonOAuth) return;
    await this.configRepo.update(config.id, {
      authType: MCP_AUTH_TYPES.OAUTH,
    });
    config.authType = MCP_AUTH_TYPES.OAUTH;
  }

  private async fetchToolList(
    config: MCPServerConfig,
  ): Promise<MCPToolDefinition[]> {
    const result = await this.request(config, MCP_METHODS.TOOLS_LIST, {});
    if (!Array.isArray(result.tools)) {
      throw new Error("Invalid tools/list response from MCP server");
    }

    return (result.tools as MCPListedTool[]).map((tool) => ({
      name: tool.name,
      description: tool.description ?? "",
      inputSchema: tool.inputSchema ?? {},
      ...(tool.annotations ? { annotations: tool.annotations } : {}),
    }));
  }

  private async invokeToolCall(
    config: MCPServerConfig,
    toolName: string,
    parameters: Record<string, unknown>,
  ): Promise<unknown> {
    return this.request(config, MCP_METHODS.TOOLS_CALL, {
      name: toolName,
      arguments: parameters,
    });
  }
}
