import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { WorkflowExecutionLog } from "../../database/entities/workflow-execution-log.entity";
import { WorkflowRule } from "../../database/entities/workflow-rule.entity";
import { WorkflowContext } from "../types/workflow.types";
import { WorkflowsService } from "../workflows.service";

const mockContext: WorkflowContext = {
  userId: "user-1",
  emailThreadId: "thread-1",
  from: "billing@upwork.com",
  fromName: "Upwork",
  subject: "Your Weekly Billing Summary",
  date: new Date("2026-03-25"),
  summary: "Upwork billing summary",
  body: "Total billed: $500",
  category: "Billing",
  priority: "medium",
};

const makeRule = (overrides: Partial<WorkflowRule> = {}): WorkflowRule => ({
  id: "rule-1",
  userId: "user-1",
  user: {} as never,
  name: "Test rule",
  enabled: true,
  priority: 0,
  condition: {
    fromPatterns: ["*@upwork.com"],
    subjectPatterns: [],
    categories: [],
    priorityLevels: [],
  },
  actions: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe("WorkflowsService", () => {
  let service: WorkflowsService;
  let rulesRepo: jest.Mocked<Repository<WorkflowRule>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowsService,
        {
          provide: getRepositoryToken(WorkflowRule),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(WorkflowExecutionLog),
          useValue: {
            find: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<WorkflowsService>(WorkflowsService);
    rulesRepo = module.get(getRepositoryToken(WorkflowRule));
  });

  describe("findMatchingRule", () => {
    it("returns null when no rules exist", async () => {
      rulesRepo.find.mockResolvedValue([]);
      const result = await service.findMatchingRule("user-1", mockContext);
      expect(result).toBeNull();
    });

    it("matches rule with matching fromPattern", async () => {
      const rule = makeRule();
      rulesRepo.find.mockResolvedValue([rule]);
      const result = await service.findMatchingRule("user-1", mockContext);
      expect(result).toBe(rule);
    });

    it("does not match disabled rule", async () => {
      const rule = makeRule({ enabled: false });
      rulesRepo.find.mockResolvedValue([rule]);
      const result = await service.findMatchingRule("user-1", mockContext);
      expect(result).toBeNull();
    });

    it("does not match when fromPattern does not match", async () => {
      const rule = makeRule({
        condition: {
          fromPatterns: ["*@github.com"],
          subjectPatterns: [],
        },
      });
      rulesRepo.find.mockResolvedValue([rule]);
      const result = await service.findMatchingRule("user-1", mockContext);
      expect(result).toBeNull();
    });

    it("matches rule with empty fromPatterns (wildcard)", async () => {
      const rule = makeRule({
        condition: {
          fromPatterns: [],
          subjectPatterns: [],
        },
      });
      rulesRepo.find.mockResolvedValue([rule]);
      const result = await service.findMatchingRule("user-1", mockContext);
      expect(result).toBe(rule);
    });

    it("matches first rule by priority when multiple rules match", async () => {
      const rule1 = makeRule({ id: "rule-1", priority: 0 });
      const rule2 = makeRule({
        id: "rule-2",
        priority: 1,
        condition: { fromPatterns: [], subjectPatterns: [] },
      });
      // find returns sorted by priority (already sorted since we set priority)
      rulesRepo.find.mockResolvedValue([rule1, rule2]);
      const result = await service.findMatchingRule("user-1", mockContext);
      expect(result?.id).toBe("rule-1");
    });

    it("matches rule with subject pattern", async () => {
      const rule = makeRule({
        condition: {
          fromPatterns: [],
          subjectPatterns: ["billing"],
        },
      });
      rulesRepo.find.mockResolvedValue([rule]);
      const result = await service.findMatchingRule("user-1", mockContext);
      expect(result).toBe(rule);
    });

    it("does not match rule when subject pattern does not match", async () => {
      const rule = makeRule({
        condition: {
          fromPatterns: [],
          subjectPatterns: ["invoice"],
        },
      });
      rulesRepo.find.mockResolvedValue([rule]);
      const result = await service.findMatchingRule("user-1", mockContext);
      expect(result).toBeNull();
    });
  });
});
