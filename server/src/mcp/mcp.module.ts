import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { MCPServerConfig } from "../database/entities/mcp-server-config.entity";
import { MCPClientManagerService } from "./mcp-client-manager.service";
import { MCPServersController } from "./mcp-servers.controller";
import { MCPServersService } from "./mcp-servers.service";

/**
 * MCPModule — user-managed MCP server connections.
 * Shared module: may be imported by workflows and other future features.
 *
 * Part of feature #1483 — Automated Email Workflows.
 */
@Module({
  imports: [TypeOrmModule.forFeature([MCPServerConfig])],
  controllers: [MCPServersController],
  providers: [MCPClientManagerService, MCPServersService],
  exports: [MCPClientManagerService, MCPServersService],
})
export class MCPModule {}
