import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { CrmSenderMatch } from "../database/entities/crm-sender-match.entity";
import { MCPSenderContextCache } from "../database/entities/mcp-sender-context-cache.entity";
import { MCPServerConfig } from "../database/entities/mcp-server-config.entity";
import { LLMModule } from "../llm/llm.module";
import { BiginRecordsClient } from "./bigin/bigin-records.client";
import { BiginSenderContextService } from "./bigin/bigin-sender-context.service";
import { CrmSenderMatchStore } from "./crm-sender-match.store";
import { MCPClientManagerService } from "./mcp-client-manager.service";
import { MCPOAuthController } from "./mcp-oauth.controller";
import { MCPOAuthService } from "./mcp-oauth.service";
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
    TypeOrmModule.forFeature([
      MCPServerConfig,
      MCPSenderContextCache,
      CrmSenderMatch,
    ]),
    LLMModule,
  ],
  controllers: [MCPOAuthController, MCPServersController],
  providers: [
    MCPClientManagerService,
    MCPOAuthService,
    MCPServersService,
    MCPSenderMappingService,
    MCPSenderContextService,
    BiginRecordsClient,
    BiginSenderContextService,
    CrmSenderMatchStore,
  ],
  exports: [
    MCPClientManagerService,
    MCPOAuthService,
    MCPServersService,
    MCPSenderContextService,
  ],
})
export class MCPModule {}
