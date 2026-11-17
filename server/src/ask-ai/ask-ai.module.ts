import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { AskAiPendingApproval } from "../database/entities/ask-ai-pending-approval.entity";
import { Email } from "../database/entities/email.entity";
import { MCPServerConfig } from "../database/entities/mcp-server-config.entity";
import { LLMModule } from "../llm/llm.module";
import { MCPModule } from "../mcp/mcp.module";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { AskAiController } from "./ask-ai.controller";
import { AskAiAgentService } from "./ask-ai-agent.service";
import { AskAiApprovalService } from "./ask-ai-approval.service";
import { AskAiToolService } from "./ask-ai-tools.service";

/**
 * AskAiModule — the agentic "Ask AI" email assistant.
 *
 * Depends only on LLMModule (tool-calling), MCPModule (connected tools) and the
 * Email/MCPServerConfig repositories. Only McpServerModule imports it (for the
 * email search tool), so it adds no circular dependencies.
 */
@Module({
  imports: [
    SubscriptionsModule,
    TypeOrmModule.forFeature([Email, MCPServerConfig, AskAiPendingApproval]),
    LLMModule,
    MCPModule,
    AuthModule,
  ],
  controllers: [AskAiController],
  providers: [AskAiAgentService, AskAiToolService, AskAiApprovalService],
  exports: [AskAiAgentService, AskAiToolService],
})
export class AskAiModule {}
