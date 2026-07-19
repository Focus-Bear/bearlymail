import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { Email } from "../database/entities/email.entity";
import { MCPServerConfig } from "../database/entities/mcp-server-config.entity";
import { LLMModule } from "../llm/llm.module";
import { MCPModule } from "../mcp/mcp.module";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";
import { AskAiController } from "./ask-ai.controller";
import { AskAiAgentService } from "./ask-ai-agent.service";
import { AskAiToolService } from "./ask-ai-tools.service";

/**
 * AskAiModule — the agentic "Ask AI" email assistant.
 *
 * Depends only on LLMModule (tool-calling), MCPModule (connected tools) and the
 * Email/MCPServerConfig repositories. Nothing imports this module, so it adds no
 * circular dependencies.
 */
@Module({
  imports: [
    SubscriptionsModule,
    TypeOrmModule.forFeature([Email, MCPServerConfig]),
    LLMModule,
    MCPModule,
    AuthModule,
  ],
  controllers: [AskAiController],
  providers: [AskAiAgentService, AskAiToolService],
  exports: [AskAiAgentService],
})
export class AskAiModule {}
