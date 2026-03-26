import { forwardRef, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { WorkflowExecutionLog } from "../database/entities/workflow-execution-log.entity";
import { WorkflowRule } from "../database/entities/workflow-rule.entity";
import { EmailsModule } from "../emails/emails.module";
import { LLMModule } from "../llm/llm.module";
import { MCPModule } from "../mcp/mcp.module";
import { QueueModule } from "../queue/queue.module";
import { WorkflowExecutionService } from "./workflow-execution.service";
import { WorkflowProcessor } from "./workflow-processor";
import { WorkflowVariableResolver } from "./workflow-variable-resolver";
import { WorkflowsController } from "./workflows.controller";
import { WorkflowsService } from "./workflows.service";

/**
 * WorkflowsModule — automated email workflow engine.
 *
 * Part of feature #1483 — Automated Email Workflows.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      WorkflowRule,
      WorkflowExecutionLog,
      Email,
      EmailThread,
    ]),
    forwardRef(() => AuthModule),
    forwardRef(() => EmailsModule),
    forwardRef(() => LLMModule),
    MCPModule,
    QueueModule,
  ],
  controllers: [WorkflowsController],
  providers: [
    WorkflowsService,
    WorkflowExecutionService,
    WorkflowProcessor,
    WorkflowVariableResolver,
  ],
  exports: [WorkflowsService, WorkflowProcessor],
})
export class WorkflowsModule {}
