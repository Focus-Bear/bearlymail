import { Test, TestingModule } from "@nestjs/testing";

import { LLMCoreService } from "../../llm/llm-core.service";
import { WorkflowContext } from "../types/workflow.types";
import { WorkflowVariableResolver } from "../workflow-variable-resolver";

const mockContext: WorkflowContext = {
  userId: "user-1",
  emailThreadId: "thread-1",
  from: "billing@upwork.com",
  fromName: "Upwork",
  subject: "Your Weekly Billing Summary",
  date: new Date("2026-03-25T10:00:00Z"),
  summary: "Upwork billing for the week of March 25",
  body: "Total billed: $500. Freelancers: Alice ($300), Bob ($200).",
  category: "Billing",
  priority: "medium",
};

describe("WorkflowVariableResolver", () => {
  let resolver: WorkflowVariableResolver;
  let llmCoreService: jest.Mocked<LLMCoreService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowVariableResolver,
        {
          provide: LLMCoreService,
          useValue: {
            generateText: jest.fn(),
          },
        },
      ],
    }).compile();

    resolver = module.get<WorkflowVariableResolver>(WorkflowVariableResolver);
    llmCoreService = module.get(LLMCoreService);
  });

  describe("built-in variable substitution", () => {
    it("substitutes {{from}}", async () => {
      const result = await resolver.resolve(
        { v: "From: {{from}}" },
        mockContext,
      );
      expect(result.v).toBe("From: billing@upwork.com");
    });

    it("substitutes {{fromName}}", async () => {
      const result = await resolver.resolve({ v: "{{fromName}}" }, mockContext);
      expect(result.v).toBe("Upwork");
    });

    it("substitutes {{subject}}", async () => {
      const result = await resolver.resolve({ v: "{{subject}}" }, mockContext);
      expect(result.v).toBe("Your Weekly Billing Summary");
    });

    it("substitutes {{date}} as ISO date", async () => {
      const result = await resolver.resolve({ v: "{{date}}" }, mockContext);
      expect(result.v).toBe("2026-03-25");
    });

    it("substitutes {{summary}}", async () => {
      const result = await resolver.resolve({ v: "{{summary}}" }, mockContext);
      expect(result.v).toBe("Upwork billing for the week of March 25");
    });

    it("substitutes multiple variables in one string", async () => {
      const result = await resolver.resolve(
        { v: "{{from}} sent: {{subject}}" },
        mockContext,
      );
      expect(result.v).toBe(
        "billing@upwork.com sent: Your Weekly Billing Summary",
      );
    });

    it("leaves unknown placeholders unchanged", async () => {
      const result = await resolver.resolve({ v: "{{unknown}}" }, mockContext);
      expect(result.v).toBe("{{unknown}}");
    });
  });

  describe("AI variable resolution", () => {
    it("calls LLM for {{ai:...}} placeholders and substitutes results", async () => {
      llmCoreService.generateText.mockResolvedValue(
        '{"1": "Alice: $300 (AUD ~$480), Bob: $200 (AUD ~$320)"}',
      );

      const result = await resolver.resolve(
        {
          description: "{{ai:Summarise spending per freelancer in AUD}}",
        },
        mockContext,
      );

      expect(llmCoreService.generateText).toHaveBeenCalledTimes(1);
      expect(result.description).toBe(
        "Alice: $300 (AUD ~$480), Bob: $200 (AUD ~$320)",
      );
    });

    it("uses fallback text when LLM fails", async () => {
      llmCoreService.generateText.mockRejectedValue(
        new Error("LLM unavailable"),
      );

      const result = await resolver.resolve(
        { v: "{{ai:some instruction}}" },
        mockContext,
      );

      expect(result.v).toBe("[AI could not resolve: some instruction]");
    });

    it("batches multiple AI placeholders into a single LLM call", async () => {
      llmCoreService.generateText.mockResolvedValue(
        '{"1": "result one", "2": "result two"}',
      );

      const result = await resolver.resolve(
        {
          title: "{{ai:task title}}",
          desc: "{{ai:task description}}",
        },
        mockContext,
      );

      expect(llmCoreService.generateText).toHaveBeenCalledTimes(1);
      expect(result.title).toBe("result one");
      expect(result.desc).toBe("result two");
    });
  });

  describe("resolveString", () => {
    it("resolves a single template string", async () => {
      const result = await resolver.resolveString(
        "Email from {{fromName}}",
        mockContext,
      );
      expect(result).toBe("Email from Upwork");
    });
  });

  describe("{{date:FORMAT}} substitution", () => {
    // mockContext.date = new Date("2026-03-25T10:00:00Z") → March 25 2026

    it("formats MMMM D, YYYY without corruption", async () => {
      const result = await resolver.resolve(
        { v: "{{date:MMMM D, YYYY}}" },
        mockContext,
      );
      // Chain-replace bug would produce "3arch 25, 2026" — single-pass should give "March 25, 2026"
      expect(result.v).toBe("March 25, 2026");
    });

    it("formats MMM D, YYYY", async () => {
      const result = await resolver.resolve(
        { v: "{{date:MMM D, YYYY}}" },
        mockContext,
      );
      expect(result.v).toBe("Mar 25, 2026");
    });

    it("formats MM/DD/YYYY with zero-padding", async () => {
      const result = await resolver.resolve(
        { v: "{{date:MM/DD/YYYY}}" },
        mockContext,
      );
      expect(result.v).toBe("03/25/2026");
    });

    it("formats D MMM YYYY", async () => {
      const result = await resolver.resolve(
        { v: "{{date:D MMM YYYY}}" },
        mockContext,
      );
      expect(result.v).toBe("25 Mar 2026");
    });

    it("formats YYYY-MM-DD", async () => {
      const result = await resolver.resolve(
        { v: "{{date:YYYY-MM-DD}}" },
        mockContext,
      );
      expect(result.v).toBe("2026-03-25");
    });

    it("does not double-substitute: MMMM token is never re-processed as MMM or M", async () => {
      // "February" contains no M tokens that should be re-replaced
      const febCtx: WorkflowContext = {
        ...mockContext,
        date: new Date("2026-02-01T00:00:00Z"),
      };
      const result = await resolver.resolve({ v: "{{date:MMMM}}" }, febCtx);
      expect(result.v).toBe("February");
    });
  });

  describe("AI fallback with nullish coalescing", () => {
    it("uses empty string from LLM rather than falling back (fixes || → ??)", async () => {
      // LLM legitimately returns empty string for item 1
      llmCoreService.generateText.mockResolvedValue('{"1": ""}');

      const result = await resolver.resolve(
        { v: "Result: {{ai:some instruction}}" },
        mockContext,
      );

      // With ||, empty string would trigger fallback → "[AI could not resolve: ...]"
      // With ??, empty string is preserved as valid LLM output
      expect(result.v).toBe("Result: ");
    });
  });
});
