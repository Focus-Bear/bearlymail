import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import axios from "axios";
import { Repository } from "typeorm";

import { assertSafeOutboundUrl } from "../common/url-validation.utils";
import {
  MCP_AUTH_TYPES,
  MCPServerConfig,
  MCPToolAnnotations,
  MCPToolDefinition,
} from "../database/entities/mcp-server-config.entity";
import { MCPOAuthService } from "./mcp-oauth.service";

const TOOL_CALL_TIMEOUT_MS = 30_000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const MS_PER_SECOND = 1000;
/** Cache TTL for the MCP tool list: 1 hour */
const TOOL_CACHE_TTL_MS = SECONDS_PER_MINUTE * MINUTES_PER_HOUR * MS_PER_SECOND;

/**
 * Manages connections to user-configured MCP servers.
 *
 * Uses a simple HTTP-based MCP client (JSON-RPC over HTTPS) matching the
 * MCP streamable HTTP transport spec. We implement the two operations needed:
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
   */
  async testConnection(
    serverId: string,
  ): Promise<{ ok: boolean; toolCount: number }> {
    try {
      const tools = await this.getTools(serverId, true);
      return { ok: true, toolCount: tools.length };
    } catch (error) {
      this.logger.warn(
        `MCP connection test failed for ${serverId}: ${(error as Error).message}`,
      );
      return { ok: false, toolCount: 0 };
    }
  }

  // ── Private MCP HTTP client ─────────────────────────────────────────────────

  /**
   * Build request headers, resolving the bearer credential from either the
   * static API key or — for OAuth connections — a valid (auto-refreshed) token.
   */
  private async buildHeaders(
    config: MCPServerConfig,
  ): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (config.authType === MCP_AUTH_TYPES.OAUTH) {
      headers["Authorization"] =
        `Bearer ${await this.oauthService.getValidAccessToken(config)}`;
    } else if (config.apiKey) {
      headers["Authorization"] = `Bearer ${config.apiKey}`;
    }
    return headers;
  }

  private async fetchToolList(
    config: MCPServerConfig,
  ): Promise<MCPToolDefinition[]> {
    // Guard against SSRF: only allow https:// and reject private/loopback hosts.
    assertSafeOutboundUrl(config.serverUrl, "MCP server URL");

    const response = await axios.post(
      config.serverUrl,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      },
      {
        headers: await this.buildHeaders(config),
        timeout: TOOL_CALL_TIMEOUT_MS,
      },
    );

    const result = response.data?.result;
    if (!result?.tools || !Array.isArray(result.tools)) {
      throw new Error("Invalid tools/list response from MCP server");
    }

    return result.tools.map(
      (tool: {
        name: string;
        description?: string;
        inputSchema?: object;
        annotations?: MCPToolAnnotations;
      }) => ({
        name: tool.name,
        description: tool.description ?? "",
        inputSchema: tool.inputSchema ?? {},
        ...(tool.annotations ? { annotations: tool.annotations } : {}),
      }),
    );
  }

  private async invokeToolCall(
    config: MCPServerConfig,
    toolName: string,
    parameters: Record<string, unknown>,
  ): Promise<unknown> {
    // Guard against SSRF: only allow https:// and reject private/loopback hosts.
    // (Also checked in fetchToolList, but validated here defensively since
    // callTool can be invoked without a prior getTools call.)
    assertSafeOutboundUrl(config.serverUrl, "MCP server URL");

    const response = await axios.post(
      config.serverUrl,
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: toolName,
          arguments: parameters,
        },
      },
      {
        headers: await this.buildHeaders(config),
        timeout: TOOL_CALL_TIMEOUT_MS,
      },
    );

    const result = response.data?.result;
    if (response.data?.error) {
      throw new Error(`MCP tool error: ${JSON.stringify(response.data.error)}`);
    }
    return result;
  }
}
