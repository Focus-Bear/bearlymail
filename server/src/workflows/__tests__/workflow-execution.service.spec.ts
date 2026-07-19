import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";

import { WorkflowExecutionLog } from "../../database/entities/workflow-execution-log.entity";
import { WorkflowRule } from "../../database/entities/workflow-rule.entity";
import { EmailArchiveService } from "../../emails/email-archive.service";
import { EmailProviderManager } from "../../emails/email-provider-manager.service";
import { LLMCoreService } from "../../llm/llm-core.service";
import { MCPClientManagerService } from "../../mcp/mcp-client-manager.service";
import { WorkflowContext } from "../types/workflow.types";
import { WorkflowExecutionService } from "../workflow-execution.service";
import { WorkflowVariableResolver } from "../workflow-variable-resolver";

const mockContext: WorkflowContext = {
  userId: "user-1",
  emailThreadId: "thread-1",
  from: "billing@upwork.com",
  fromName: "Upwork",
  subject: "Weekly Billing Summary",
  date: new Date("2026-03-25"),
  summary: "Upwork billing summary",
  body: "Total: $500",
  category: "Billing",
  priority: "medium",
};

const makeRule = (overrides: Partial<WorkflowRule> = {}): WorkflowRule => ({
  id: "rule-1",
  userId: "user-1",
  user: {} as never,
  name: "Test Rule",
  enabled: true,
  priority: 0,
  condition: { fromPatterns: [], subjectPatterns: [] },
  actions: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe("WorkflowExecutionService", () => {
  let service: WorkflowExecutionService;
  let mcpClient: jest.Mocked<MCPClientManagerService>;
  let archiveService: { archiveThreadById: jest.Mock };
  let logsRepo: { create: jest.Mock; save: jest.Mock; update: jest.Mock };

  beforeEach(async () => {
    logsRepo = {
      create: jest.fn().mockReturnValue({
        status: "running",
        actionResults: [],
      }),
      save: jest.fn().mockResolvedValue({ id: "log-1" }),
      update: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowExecutionService,
        {
          provide: getRepositoryToken(WorkflowExecutionLog),
          useValue: logsRepo,
        },
        {
          provide: WorkflowVariableResolver,
          useValue: {
            resolve: jest
              .fn()
              .mockImplementation((params) => Promise.resolve(params)),
          },
        },
        {
          provide: MCPClientManagerService,
          useValue: {
            callTool: jest.fn(),
          },
        },
        {
          provide: EmailProviderManager,
          useValue: {
            getProvider: jest.fn(),
            getPrimaryProvider: jest.fn(),
          },
        },
        {
          provide: EmailArchiveService,
          useValue: {
            archiveThreadById: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: LLMCoreService,
          useValue: {
            generateText: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<WorkflowExecutionService>(WorkflowExecutionService);
    mcpClient = module.get(MCPClientManagerService);
    archiveService = module.get(EmailArchiveService);
  });

  it("archives the thread for an archive action", async () => {
    const rule = makeRule({ actions: [{ type: "archive" }] });

    const result = await service.execute(rule, mockContext);

    expect(archiveService.archiveThreadById).toHaveBeenCalledWith(
      mockContext.userId,
      mockContext.emailThreadId,
      { viaWorkflow: true },
    );
    expect(result.status).toBe("success");
  });

  it("returns success when all actions succeed", async () => {
    mcpClient.callTool.mockResolvedValue({ taskId: "task-123" });

    const rule = makeRule({
      actions: [
        {
          type: "mcp_tool",
          serverId: "fb-server",
          toolName: "create-task",
          parameters: { title: "Task: {{subject}}" },
        },
      ],
    });

    const result = await service.execute(rule, mockContext);

    expect(result.matched).toBe(true);
    expect(result.status).toBe("success");
    expect(result.actionResults?.[0].status).toBe("success");
  });

  it("returns partial_failure when some actions fail", async () => {
    mcpClient.callTool
      .mockResolvedValueOnce({ taskId: "task-1" })
      .mockRejectedValueOnce(new Error("MCP timeout"));

    const rule = makeRule({
      actions: [
        {
          type: "mcp_tool",
          serverId: "fb-server",
          toolName: "create-task",
          parameters: { title: "Task 1" },
        },
        {
          type: "mcp_tool",
          serverId: "fb-server",
          toolName: "create-task",
          parameters: { title: "Task 2" },
        },
      ],
    });

    const result = await service.execute(rule, mockContext);
    expect(result.status).toBe("partial_failure");
  });

  it("returns failed when all actions fail", async () => {
    mcpClient.callTool.mockRejectedValue(new Error("MCP unavailable"));

    const rule = makeRule({
      actions: [
        {
          type: "mcp_tool",
          serverId: "fb-server",
          toolName: "create-task",
          parameters: { title: "Task" },
        },
      ],
    });

    const result = await service.execute(rule, mockContext);
    expect(result.status).toBe("failed");
    expect(result.actionResults?.[0].error).toBe("MCP unavailable");
  });

  it("returns success with no actions", async () => {
    const rule = makeRule({ actions: [] });
    const result = await service.execute(rule, mockContext);
    expect(result.status).toBe("success");
  });

  describe("executeWebhook — SSRF protection", () => {
    it("rejects http:// webhook URLs", async () => {
      const rule = makeRule({
        actions: [
          {
            type: "webhook",
            url: "http://example.com/hook",
            method: "POST",
            bodyTemplate: "{}",
          },
        ],
      });

      const result = await service.execute(rule, mockContext);
      expect(result.status).toBe("failed");
      expect(result.actionResults?.[0].error).toMatch(/only https:\/\//);
    });

    it("rejects internal IP webhook URLs (SSRF)", async () => {
      const rule = makeRule({
        actions: [
          {
            type: "webhook",
            url: "https://169.254.169.254/latest/meta-data/",
            method: "POST",
            bodyTemplate: "{}",
          },
        ],
      });

      const result = await service.execute(rule, mockContext);
      expect(result.status).toBe("failed");
      expect(result.actionResults?.[0].error).toMatch(
        /private\/internal hosts/,
      );
    });

    it("rejects localhost webhook URLs", async () => {
      const rule = makeRule({
        actions: [
          {
            type: "webhook",
            url: "https://localhost:5432/internal",
            method: "POST",
            bodyTemplate: "{}",
          },
        ],
      });

      const result = await service.execute(rule, mockContext);
      expect(result.status).toBe("failed");
      expect(result.actionResults?.[0].error).toMatch(
        /private\/internal hosts/,
      );
    });
  });

  describe("evaluateNaturalLanguageCondition", () => {
    it("returns true when no NL condition", async () => {
      const rule = makeRule();
      const result = await service.evaluateNaturalLanguageCondition(
        rule,
        mockContext,
      );
      expect(result).toBe(true);
    });

    it("returns LLM decision when NL condition present", async () => {
      jest
        .spyOn(service["llmCoreService"], "generateText")
        .mockResolvedValue('{"matches": true}');
      const rule = makeRule({
        condition: {
          fromPatterns: [],
          subjectPatterns: [],
          naturalLanguageCondition: "billing summary with line items",
        },
      });
      const result = await service.evaluateNaturalLanguageCondition(
        rule,
        mockContext,
      );
      expect(result).toBe(true);
    });

    it("defaults to true when LLM fails", async () => {
      jest
        .spyOn(service["llmCoreService"], "generateText")
        .mockRejectedValue(new Error("timeout"));
      const rule = makeRule({
        condition: {
          fromPatterns: [],
          subjectPatterns: [],
          naturalLanguageCondition: "some condition",
        },
      });
      const result = await service.evaluateNaturalLanguageCondition(
        rule,
        mockContext,
      );
      expect(result).toBe(true);
    });
  });
});
