import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { INJECT_TOKENS } from "../../constants/inject-tokens";
import { Email } from "../../database/entities/email.entity";
import { EmailThread } from "../../database/entities/email-thread.entity";
import { WorkflowExecutionLog } from "../../database/entities/workflow-execution-log.entity";
import { WorkflowRule } from "../../database/entities/workflow-rule.entity";
import { EmailArchiveService } from "../../emails/email-archive.service";
import { EmailProviderManager } from "../../emails/email-provider-manager.service";
import { UserEncryptionService } from "../../encryption/user-encryption.service";
import { LLMCoreService } from "../../llm/llm-core.service";
import { MCPClientManagerService } from "../../mcp/mcp-client-manager.service";
import { WorkflowExecutionService } from "../workflow-execution.service";
import { WorkflowProcessor } from "../workflow-processor";
import { WorkflowVariableResolver } from "../workflow-variable-resolver";
import { WorkflowsService } from "../workflows.service";

const USER_ID = "user-1";
const THREAD_ID = "thread-1";

const archiveRule: WorkflowRule = {
  id: "rule-archive",
  userId: USER_ID,
  user: {} as never,
  name: "Archive newsletters",
  enabled: true,
  priority: 0,
  condition: {
    fromPatterns: [],
    subjectPatterns: [],
    naturalLanguageCondition: "a marketing newsletter",
  },
  actions: [{ type: "archive" }],
  createdAt: new Date(),
  updatedAt: new Date(),
};

/**
 * Runs the real WorkflowExecutionService behind the processor so the test
 * covers the whole decision: NL condition verdict → whether the archive
 * action reaches the mailbox.
 */
describe("WorkflowProcessor — NL condition gate", () => {
  let processor: WorkflowProcessor;
  let generateText: jest.Mock;
  let archiveThreadById: jest.Mock;

  beforeEach(async () => {
    generateText = jest.fn();
    archiveThreadById = jest.fn().mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowProcessor,
        WorkflowExecutionService,
        { provide: INJECT_TOKENS.PG_BOSS, useValue: {} },
        {
          provide: getRepositoryToken(Email),
          useValue: {
            findOne: jest.fn().mockResolvedValue({
              from: "news@example.com",
              fromName: "Example",
              subject: "This week's deals",
              receivedAt: new Date("2026-11-01"),
              summary: "Weekly deals",
              body: "Deals",
            }),
          },
        },
        {
          provide: getRepositoryToken(EmailThread),
          useValue: { findOne: jest.fn().mockResolvedValue(null) },
        },
        {
          provide: getRepositoryToken(WorkflowExecutionLog),
          useValue: {
            create: jest.fn().mockReturnValue({ id: "log-1" }),
            save: jest.fn().mockResolvedValue({ id: "log-1" }),
            update: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: WorkflowsService,
          useValue: {
            findMatchingRule: jest.fn().mockResolvedValue(archiveRule),
          },
        },
        { provide: UserEncryptionService, useValue: {} },
        { provide: WorkflowVariableResolver, useValue: {} },
        { provide: MCPClientManagerService, useValue: {} },
        { provide: EmailProviderManager, useValue: {} },
        { provide: EmailArchiveService, useValue: { archiveThreadById } },
        { provide: LLMCoreService, useValue: { generateText } },
      ],
    }).compile();

    processor = module.get(WorkflowProcessor);
  });

  const processThread = () => processor["processWorkflows"](USER_ID, THREAD_ID);

  it("does not archive when the condition check's LLM call fails", async () => {
    generateText.mockRejectedValue(new Error("LLM provider unavailable"));

    const result = await processThread();

    expect(archiveThreadById).not.toHaveBeenCalled();
    expect(result).toEqual({ matched: false, reason: "nl_condition_failed" });
  });

  it("does not archive when the LLM reply has no usable verdict", async () => {
    generateText.mockResolvedValue("not json");

    await processThread();

    expect(archiveThreadById).not.toHaveBeenCalled();
  });

  it("archives when the LLM confirms the condition matches", async () => {
    generateText.mockResolvedValue('{"matches": true}');

    await processThread();

    expect(archiveThreadById).toHaveBeenCalledWith(USER_ID, THREAD_ID, {
      viaWorkflow: true,
    });
  });
});
