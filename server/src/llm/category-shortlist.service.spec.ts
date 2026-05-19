import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";

import {
  CATEGORY_SHORTLIST_PROMPT_ID,
  type CategoryItem,
  CategoryShortlistService,
} from "./category-shortlist.service";
import { LLMCoreService } from "./llm-core.service";
import * as prompts from "./prompts";

jest.mock("./prompts", () => ({
  getPrompt: jest.fn(),
  renderPrompt: jest.fn(),
  loadPrompts: jest.fn(),
  PRIORITY_PROMPT_IDS: {
    ANALYZE_PRIORITY: "analyze_priority",
    ANALYZE_PRIORITY_FEEDBACK: "analyze_priority_feedback",
    INCREMENTAL_PRIORITY_CHECK: "incremental_priority_check",
    CATEGORY_SHORTLIST: "category_shortlist",
  },
}));

const mockEmail = {
  from: "sender@example.com",
  fromName: "Sender Name",
  subject: "Test Email",
  summary: "This is a test email summary.",
};

const allCategories = [
  {
    name: "Customer Support",
    description: "Support tickets",
    categoryKey: "customer_support",
  },
  { name: "Sales", description: "Sales enquiries", categoryKey: "sales" },
  { name: "Marketing", description: "Marketing emails", categoryKey: "mkt" },
  {
    name: "Engineering",
    description: "Engineering team",
    categoryKey: "engineering",
  },
  { name: "Finance", description: "Finance related", categoryKey: "finance" },
  { name: "HR", description: "Human resources", categoryKey: "hr" },
  { name: "Legal", description: "Legal matters", categoryKey: "legal" },
  {
    name: "Operations",
    description: "Operations team",
    categoryKey: "operations",
  },
  { name: "Product", description: "Product team", categoryKey: "product" },
  { name: "Design", description: "Design team", categoryKey: "design" },
  { name: "Data", description: "Data team", categoryKey: "data" },
  { name: "Security", description: "Security alerts", categoryKey: "security" },
  { name: "Other" },
];

describe("CategoryShortlistService", () => {
  let service: CategoryShortlistService;
  let mockLLMCoreService: jest.Mocked<Partial<LLMCoreService>>;
  let mockConfigService: jest.Mocked<Partial<ConfigService>>;

  beforeEach(async () => {
    mockLLMCoreService = {
      generateText: jest.fn(),
    };

    mockConfigService = {
      get: jest.fn(),
    };

    (prompts.getPrompt as jest.Mock).mockReturnValue({
      id: CATEGORY_SHORTLIST_PROMPT_ID,
      prompt: "Pick {{topN}} from {{categories}} for email: {{subject}}",
      systemPrompt: "You are a fast email categoriser.",
    });
    (prompts.renderPrompt as jest.Mock).mockReturnValue(
      "Pick 10 from categories for email: Test Email",
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoryShortlistService,
        { provide: LLMCoreService, useValue: mockLLMCoreService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<CategoryShortlistService>(CategoryShortlistService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("isShortlistEnabled", () => {
    it("should return false when category count is below threshold", () => {
      expect(service.isShortlistEnabled(10)).toBe(false);
    });

    it("should return true when category count exceeds threshold", () => {
      expect(service.isShortlistEnabled(20)).toBe(true);
    });

    it("should return true exactly at threshold + 1", () => {
      expect(service.isShortlistEnabled(13)).toBe(true);
    });

    it("should return false at exactly the threshold", () => {
      expect(service.isShortlistEnabled(12)).toBe(false);
    });
  });

  describe("getShortlist", () => {
    it("should return empty array when allCategories is empty", async () => {
      const result = await service.getShortlist(mockEmail, []);
      expect(result).toEqual([]);
      expect(mockLLMCoreService.generateText).not.toHaveBeenCalled();
    });

    it("should return full list when prompt config is not found", async () => {
      (prompts.getPrompt as jest.Mock).mockReturnValue(null);
      const result = await service.getShortlist(mockEmail, allCategories);
      expect(result).toEqual(allCategories);
      expect(mockLLMCoreService.generateText).not.toHaveBeenCalled();
    });

    it("should return filtered categories matching LLM response JSON object", async () => {
      (mockLLMCoreService.generateText as jest.Mock).mockResolvedValue(
        '{"categories": ["Customer Support", "Engineering", "Security"]}',
      );

      const result = await service.getShortlist(mockEmail, allCategories);

      expect(result.map((cat) => cat.name)).toContain("Customer Support");
      expect(result.map((cat) => cat.name)).toContain("Engineering");
      expect(result.map((cat) => cat.name)).toContain("Security");
      // "Other" is NOT appended — smart model handles that in Step 2
      expect(result.map((cat) => cat.name)).not.toContain("Other");
    });

    it("should NOT include Other even if categories contain it (Other handled by smart model)", async () => {
      (mockLLMCoreService.generateText as jest.Mock).mockResolvedValue(
        '{"categories": ["Customer Support", "Engineering"]}',
      );

      const result = await service.getShortlist(mockEmail, allCategories);

      expect(result.map((cat) => cat.name)).not.toContain("Other");
    });

    it("should not include Other even if LLM response contains it", async () => {
      // LLM shouldn't return Other (prompt excludes it), but even if it does we filter it
      (mockLLMCoreService.generateText as jest.Mock).mockResolvedValue(
        '{"categories": ["Customer Support", "Other"]}',
      );

      const result = await service.getShortlist(mockEmail, allCategories);

      // Customer Support should be included, Other should be excluded
      expect(result.map((cat) => cat.name)).toContain("Customer Support");
      expect(result.map((cat) => cat.name)).not.toContain("Other");
    });

    it("should also accept bare JSON array response for resilience", async () => {
      (mockLLMCoreService.generateText as jest.Mock).mockResolvedValue(
        '["Customer Support", "Engineering"]',
      );

      const result = await service.getShortlist(mockEmail, allCategories);

      expect(result.map((cat) => cat.name)).toContain("Customer Support");
      expect(result.map((cat) => cat.name)).toContain("Engineering");
    });

    it("should do case-insensitive matching of category names", async () => {
      (mockLLMCoreService.generateText as jest.Mock).mockResolvedValue(
        '["customer support", "ENGINEERING"]',
      );

      const result = await service.getShortlist(mockEmail, allCategories);

      expect(result.map((cat) => cat.name)).toContain("Customer Support");
      expect(result.map((cat) => cat.name)).toContain("Engineering");
    });

    it("should fall back to full list when LLM returns no matching categories", async () => {
      (mockLLMCoreService.generateText as jest.Mock).mockResolvedValue(
        '["NonExistentCategory", "AnotherFakeCategory"]',
      );

      const result = await service.getShortlist(mockEmail, allCategories);

      expect(result).toEqual(allCategories);
    });

    it("should fall back to full list on LLM call failure", async () => {
      (mockLLMCoreService.generateText as jest.Mock).mockRejectedValue(
        new Error("LLM service unavailable"),
      );

      const result = await service.getShortlist(mockEmail, allCategories);

      expect(result).toEqual(allCategories);
    });

    it("should fall back to full list when response has no JSON array", async () => {
      (mockLLMCoreService.generateText as jest.Mock).mockResolvedValue(
        "Sorry, I cannot help with that.",
      );

      const result = await service.getShortlist(mockEmail, allCategories);

      expect(result).toEqual(allCategories);
    });

    it("should fall back to full list when response array is not strings", async () => {
      (mockLLMCoreService.generateText as jest.Mock).mockResolvedValue(
        "[1, 2, 3]",
      );

      const result = await service.getShortlist(mockEmail, allCategories);

      expect(result).toEqual(allCategories);
    });

    it("should pass topN parameter to prompt rendering", async () => {
      (mockLLMCoreService.generateText as jest.Mock).mockResolvedValue(
        '["Customer Support"]',
      );

      await service.getShortlist(mockEmail, allCategories, 5);

      expect(prompts.renderPrompt).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ topN: "5" }),
      );
    });

    it("should match shortlisted categories by stable categoryKey from LLM", async () => {
      (mockLLMCoreService.generateText as jest.Mock).mockResolvedValue(
        '{"categories": ["customer_support", "engineering", "security"]}',
      );

      const result = await service.getShortlist(mockEmail, allCategories);

      expect(result.map((cat) => cat.name)).toEqual([
        "Customer Support",
        "Engineering",
        "Security",
      ]);
    });

    it("should accept { id } objects in categories array", async () => {
      (mockLLMCoreService.generateText as jest.Mock).mockResolvedValue(
        '{"categories": [{"id": "sales"}, {"id": "hr"}]}',
      );

      const result = await service.getShortlist(mockEmail, allCategories);

      expect(result.map((cat) => cat.name)).toEqual(["Sales", "HR"]);
    });
  });

  describe("getPlatformKeywordsForSender", () => {
    it("returns github keyword for github.com sender", () => {
      expect(
        service.getPlatformKeywordsForSender("notifications@github.com"),
      ).toEqual(["github"]);
    });

    it("returns gitlab keyword for gitlab.com sender", () => {
      expect(
        service.getPlatformKeywordsForSender("noreply@gitlab.com"),
      ).toEqual(["gitlab"]);
    });

    it("returns empty array for unknown sender", () => {
      expect(service.getPlatformKeywordsForSender("user@example.com")).toEqual(
        [],
      );
    });

    it("is case-insensitive", () => {
      expect(
        service.getPlatformKeywordsForSender("Notifications@GITHUB.COM"),
      ).toEqual(["github"]);
    });
  });

  describe("pinPlatformCategories", () => {
    const githubPRs: CategoryItem = {
      name: "🐙 GitHub PRs",
      categoryKey: "github_prs",
    };
    const githubNotifications: CategoryItem = {
      name: "🔔 GitHub Notifications",
      categoryKey: "github_notif",
    };
    const sales: CategoryItem = { name: "Sales", categoryKey: "sales" };
    const other: CategoryItem = { name: "Other" };

    it("pins missing github categories for github.com sender", () => {
      const shortlisted = [sales];
      const all = [sales, githubPRs, githubNotifications, other];
      const result = service.pinPlatformCategories(
        shortlisted,
        all,
        "notifications@github.com",
      );
      expect(result.map((cat) => cat.name)).toContain("🐙 GitHub PRs");
      expect(result.map((cat) => cat.name)).toContain(
        "🔔 GitHub Notifications",
      );
      expect(result.map((cat) => cat.name)).not.toContain("Other");
    });

    it("does not duplicate already-shortlisted github categories", () => {
      const shortlisted = [sales, githubPRs];
      const all = [sales, githubPRs, githubNotifications];
      const result = service.pinPlatformCategories(
        shortlisted,
        all,
        "notifications@github.com",
      );
      const names = result.map((cat) => cat.name);
      expect(names.filter((name) => name === "🐙 GitHub PRs")).toHaveLength(1);
      expect(names).toContain("🔔 GitHub Notifications");
    });

    it("returns shortlist unchanged for non-platform sender", () => {
      const shortlisted = [sales, githubPRs];
      const all = [sales, githubPRs, githubNotifications];
      const result = service.pinPlatformCategories(
        shortlisted,
        all,
        "user@example.com",
      );
      expect(result).toEqual(shortlisted);
    });
  });

  describe("getShortlist — platform pinning integration", () => {
    it("pins github categories when email is from github.com", async () => {
      const githubEmail = {
        from: "notifications@github.com",
        fromName: "GitHub",
        subject: "Dependabot opened a PR",
        summary: "A pull request was opened",
      };
      const githubCategories: CategoryItem[] = [
        ...allCategories,
        {
          name: "🐙 GitHub PRs",
          description: "Pull request activity",
          categoryKey: "github_prs",
        },
        {
          name: "🔔 GitHub Notifications",
          description: "General GitHub notifications",
          categoryKey: "github_notif",
        },
      ];

      // LLM shortlist returns only non-github categories
      (mockLLMCoreService.generateText as jest.Mock).mockResolvedValue(
        '{"categories": ["customer_support", "engineering"]}',
      );

      const result = await service.getShortlist(githubEmail, githubCategories);

      // Both GitHub categories must be pinned even though LLM didn't select them
      expect(result.map((cat) => cat.name)).toContain("🐙 GitHub PRs");
      expect(result.map((cat) => cat.name)).toContain(
        "🔔 GitHub Notifications",
      );
    });

    it("does not pin platform categories for non-platform email", async () => {
      const regularEmail = {
        from: "alice@example.com",
        fromName: "Alice",
        subject: "Hello",
        summary: "Just a regular email",
      };
      const categoriesWithGitHub: CategoryItem[] = [
        ...allCategories,
        {
          name: "🐙 GitHub PRs",
          description: "Pull request activity",
          categoryKey: "github_prs",
        },
      ];

      (mockLLMCoreService.generateText as jest.Mock).mockResolvedValue(
        '{"categories": ["customer_support"]}',
      );

      const result = await service.getShortlist(
        regularEmail,
        categoriesWithGitHub,
      );

      // GitHub category should NOT be pinned for a non-GitHub sender
      expect(result.map((cat) => cat.name)).not.toContain("🐙 GitHub PRs");
    });
  });
});
