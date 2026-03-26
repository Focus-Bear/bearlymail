import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { MCPServerConfig } from "../database/entities/mcp-server-config.entity";
import { MCPClientManagerService } from "./mcp-client-manager.service";

export interface CreateMCPServerDto {
  name: string;
  serverUrl: string;
  apiKey?: string;
}

export interface UpdateMCPServerDto {
  name?: string;
  serverUrl?: string;
  apiKey?: string;
  enabled?: boolean;
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
    const config = this.configRepo.create({
      userId,
      name: dto.name,
      serverUrl: dto.serverUrl,
      apiKey: dto.apiKey ?? null,
    });
    const saved = await this.configRepo.save(config);

    // Eagerly fetch tool list so UI can show tools immediately
    try {
      await this.mcpClientManager.getTools(saved.id, true);
    } catch (err) {
      this.logger.warn(
        `Could not fetch tools for new MCP server ${saved.id}: ${(err as Error).message}`,
      );
    }

    return this.configRepo.findOne({
      where: { id: saved.id },
    }) as Promise<MCPServerConfig>;
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateMCPServerDto,
  ): Promise<MCPServerConfig> {
    // Throws if not found / not owned — ownership check before mutation
    await this.findOne(userId, id);
    await this.configRepo.update({ id, userId }, dto);
    return this.findOne(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findOne(userId, id);
    await this.configRepo.delete({ id, userId });
  }

  async refreshTools(
    userId: string,
    id: string,
  ): Promise<{ toolCount: number }> {
    await this.findOne(userId, id);
    const tools = await this.mcpClientManager.getTools(id, true);
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
