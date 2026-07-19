import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import {
  MCP_AUTH_TYPES,
  MCP_SERVER_PURPOSES,
  MCPAuthType,
  MCPServerConfig,
  MCPServerPurpose,
} from "../database/entities/mcp-server-config.entity";
import { MCPClientManagerService } from "./mcp-client-manager.service";
import { MCPSenderMappingService } from "./mcp-sender-mapping.service";

export interface CreateMCPServerDto {
  name: string;
  serverUrl: string;
  apiKey?: string;
  purpose?: MCPServerPurpose;
  authType?: MCPAuthType;
}

export interface UpdateMCPServerDto {
  name?: string;
  serverUrl?: string;
  apiKey?: string;
  enabled?: boolean;
  purpose?: MCPServerPurpose;
}

/**
 * CRUD service for MCP server configurations.
 *
 * Part of feature #1483 — Automated Email Workflows.
 */
@Injectable()
export class MCPServersService {
  private readonly logger = new Logger(MCPServersService.name);

  constructor(
    @InjectRepository(MCPServerConfig)
    private readonly configRepo: Repository<MCPServerConfig>,
    private readonly mcpClientManager: MCPClientManagerService,
    private readonly senderMappingService: MCPSenderMappingService,
  ) {}

  async findAll(userId: string): Promise<MCPServerConfig[]> {
    return this.configRepo.find({
      where: { userId },
      order: { createdAt: "ASC" },
    });
  }

  async findOne(userId: string, id: string): Promise<MCPServerConfig> {
    const config = await this.configRepo.findOne({ where: { id, userId } });
    if (!config) throw new NotFoundException(`MCP server not found: ${id}`);
    return config;
  }

  async create(
    userId: string,
    dto: CreateMCPServerDto,
  ): Promise<MCPServerConfig> {
    const authType = dto.authType ?? MCP_AUTH_TYPES.BEARER;
    const config = this.configRepo.create({
      userId,
      name: dto.name,
      serverUrl: dto.serverUrl,
      apiKey: dto.apiKey ?? null,
      purpose: dto.purpose ?? MCP_SERVER_PURPOSES.WORKFLOW,
      authType,
    });
    const saved = await this.configRepo.save(config);

    // OAuth connections aren't usable until the user completes authorization,
    // so skip eager tool fetch / mapping derivation until tokens exist.
    if (authType === MCP_AUTH_TYPES.OAUTH) {
      return saved;
    }

    // Eagerly fetch tool list so UI can show tools immediately
    try {
      await this.mcpClientManager.getTools(saved.id, true);
    } catch (err) {
      this.logger.warn(
        `Could not fetch tools for new MCP server ${saved.id}: ${(err as Error).message}`,
      );
    }

    // Sender-context servers need a lookup mapping derived from their tools.
    if (saved.purpose === MCP_SERVER_PURPOSES.SENDER_CONTEXT) {
      await this.deriveSenderMappingSafely(saved.id, userId);
    }

    return this.configRepo.findOne({
      where: { id: saved.id },
    }) as Promise<MCPServerConfig>;
  }

  /**
   * After OAuth completes, fetch tools and derive sender mapping so the
   * connection is immediately usable. Best-effort: never throws.
   */
  async onOAuthConnected(serverId: string, userId: string): Promise<void> {
    try {
      await this.mcpClientManager.getTools(serverId, true);
    } catch (err) {
      this.logger.warn(
        `Could not fetch tools after OAuth for ${serverId}: ${(err as Error).message}`,
      );
    }
    const config = await this.configRepo.findOne({ where: { id: serverId } });
    if (config?.purpose === MCP_SERVER_PURPOSES.SENDER_CONTEXT) {
      await this.deriveSenderMappingSafely(serverId, userId);
    }
  }

  /** Derive the sender-lookup mapping without letting a failure break the request. */
  private async deriveSenderMappingSafely(
    serverId: string,
    userId: string,
  ): Promise<void> {
    try {
      await this.senderMappingService.deriveMapping(serverId, userId);
    } catch (err) {
      this.logger.warn(
        `Could not derive sender mapping for MCP server ${serverId}: ${(err as Error).message}`,
      );
    }
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateMCPServerDto,
  ): Promise<MCPServerConfig> {
    // Throws if not found / not owned — ownership check before mutation
    const existing = await this.findOne(userId, id);

    // A new URL or API key means the cached tool list and any derived sender
    // mapping are stale — clear them so we re-fetch/re-derive below.
    const connectionChanged =
      (dto.serverUrl !== undefined && dto.serverUrl !== existing.serverUrl) ||
      (dto.apiKey !== undefined && dto.apiKey !== existing.apiKey);

    const updatePayload: Partial<MCPServerConfig> = { ...dto };
    if (connectionChanged) {
      updatePayload.cachedTools = null;
      updatePayload.toolsCachedAt = null;
      updatePayload.senderLookupMapping = null;
    }

    await this.configRepo.update({ id, userId }, updatePayload);
    const updated = await this.findOne(userId, id);

    if (connectionChanged) {
      try {
        await this.mcpClientManager.getTools(id, true);
      } catch (err) {
        this.logger.warn(
          `Could not fetch tools for updated MCP server ${id}: ${(err as Error).message}`,
        );
      }
    }

    // Re-derive the mapping if this is now a sender-context server but has no
    // mapping yet (e.g. purpose was just flipped from "workflow", or the
    // connection details changed and the previous mapping was cleared above).
    if (
      updated.purpose === MCP_SERVER_PURPOSES.SENDER_CONTEXT &&
      (!updated.senderLookupMapping || connectionChanged)
    ) {
      await this.deriveSenderMappingSafely(id, userId);
      return this.findOne(userId, id);
    }
    return updated;
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findOne(userId, id);
    await this.configRepo.delete({ id, userId });
  }

  async refreshTools(
    userId: string,
    id: string,
  ): Promise<{ toolCount: number }> {
    const config = await this.findOne(userId, id);
    const tools = await this.mcpClientManager.getTools(id, true);
    // The tool list changed — re-derive the sender mapping against it.
    if (config.purpose === MCP_SERVER_PURPOSES.SENDER_CONTEXT) {
      await this.deriveSenderMappingSafely(id, userId);
    }
    return { toolCount: tools.length };
  }

  async getTools(userId: string, id: string) {
    await this.findOne(userId, id);
    const tools = await this.mcpClientManager.getTools(id);
    return tools;
  }

  async testConnection(
    userId: string,
    id: string,
  ): Promise<{ ok: boolean; toolCount: number }> {
    await this.findOne(userId, id);
    return this.mcpClientManager.testConnection(id);
  }
}
