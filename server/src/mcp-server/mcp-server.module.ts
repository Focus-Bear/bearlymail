import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AskAiModule } from "../ask-ai/ask-ai.module";
import { AuditLog } from "../database/entities/audit-log.entity";
import { DraftsModule } from "../drafts/drafts.module";
import { EmailSendQueueModule } from "../email-send-queue/email-send-queue.module";
import { EmailTrackingModule } from "../email-tracking/email-tracking.module";
import { EmailsModule } from "../emails/emails.module";
import { FollowUpsModule } from "../follow-ups/follow-ups.module";
import { PersonalAccessTokensModule } from "../personal-access-tokens/personal-access-tokens.module";
import { McpDraftToolsService } from "./mcp-draft-tools.service";
import { McpRateLimitGuard } from "./mcp-rate-limit.guard";
import { McpReadToolsService } from "./mcp-read-tools.service";
import { McpSendToolsService } from "./mcp-send-tools.service";
import { McpServerController } from "./mcp-server.controller";
import { McpServerProtocolService } from "./mcp-server-protocol.service";
import { McpServerToolsService } from "./mcp-server-tools.service";

/**
 * BearlyMail as an MCP server, so Claude can read, draft and send the user's mail.
 * Distinct from MCPModule (`src/mcp/`), which is BearlyMail acting as a client.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([AuditLog]),
    PersonalAccessTokensModule,
    EmailsModule,
    DraftsModule,
    EmailSendQueueModule,
    EmailTrackingModule,
    FollowUpsModule,
    AskAiModule,
  ],
  controllers: [McpServerController],
  providers: [
    McpRateLimitGuard,
    McpServerProtocolService,
    McpServerToolsService,
    McpReadToolsService,
    McpSendToolsService,
    McpDraftToolsService,
  ],
})
export class McpServerModule {}
