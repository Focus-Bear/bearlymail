import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { MCPSenderContextCache } from "../database/entities/mcp-sender-context-cache.entity";
import { MCPServerConfig } from "../database/entities/mcp-server-config.entity";
import { LLMModule } from "../llm/llm.module";
import { MCPClientManagerService } from "./mcp-client-manager.service";
import { MCPSenderContextService } from "./mcp-sender-context.service";
import { MCPSenderMappingService } from "./mcp-sender-mapping.service";
import { MCPServersController } from "./mcp-servers.controller";
import { MCPServersService } from "./mcp-servers.service";

/**
 * MCPModule — user-managed MCP server connections.
 * Shared module: imported by workflows (tool invocation) and email viewing
 * (sender-context enrichment).
 *
 * MCP server management started in feature #1483 (Automated Email Workflows);
 * sender-context enrichment reuses the same connection/credential plumbing.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([MCPServerConfig, MCPSenderContextCache]),
    LLMModule,
  ],
  controllers: [MCPServersController],
  providers: [
    MCPClientManagerService,
    MCPServersService,
    MCPSenderMappingService,
    MCPSenderContextService,
  ],
  exports: [
    MCPClientManagerService,
    MCPServersService,
    MCPSenderContextService,
  ],
})
export class MCPModule {}
