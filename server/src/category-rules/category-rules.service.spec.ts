import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import crypto from "crypto";

import { CategoryRule } from "../database/entities/category-rule.entity";
import { CategoryRulesService } from "./category-rules.service";

const mockRuleRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  delete: jest.fn(),
  increment: jest.fn(),
});

describe("CategoryRulesService", () => {
  let service: CategoryRulesService;
  let repo: ReturnType<typeof mockRuleRepo>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoryRulesService,
        {
          provide: getRepositoryToken(CategoryRule),
          useFactory: mockRuleRepo,
        },
      ],
    }).compile();

    service = module.get<CategoryRulesService>(CategoryRulesService);
    repo = module.get(getRepositoryToken(CategoryRule));
  });

  afterEach(() => jest.clearAllMocks());

  // ---------------------------------------------------------------------------
  // generateRuleFromEmail
  // ---------------------------------------------------------------------------

  describe("generateRuleFromEmail", () => {
    const userId = "user-1";
    const category = "GitHub Notifications";

    it("creates a sender_domain rule for a non-generic corporate sender", async () => {
      repo.findOne.mockResolvedValue(null);
      const created = {
        id: "r1",
        ruleType: "sender_domain",
        pattern: "@acmecorp.com",
      };
      repo.create.mockReturnValue(created);
      repo.save.mockResolvedValue(created);

      const result = await service.generateRuleFromEmail(
        userId,
        { from: "team@acmecorp.com", subject: "New pull request" },
        category,
      );

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ruleKind: "legacy",
          ruleType: "sender_domain",
          pattern: "@acmecorp.com",
        }),
      );
      expect(result).not.toBeNull();
    });

    it("creates an exact_sender rule for automated addresses (noreply@)", async () => {
      repo.findOne.mockResolvedValue(null);
      const created = {
        id: "r2",
        ruleType: "exact_sender",
        pattern: "noreply@stripe.com",
      };
      repo.create.mockReturnValue(created);
      repo.save.mockResolvedValue(created);

      await service.generateRuleFromEmail(
        userId,
        { from: "noreply@stripe.com", subject: "Your receipt" },
        "Billing",
      );

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ruleKind: "legacy",
          ruleType: "exact_sender",
          pattern: "noreply@stripe.com",
        }),
      );
    });

    it("creates a sender_domain_and_subject_prefix rule for domain + [PREFIX]", async () => {
      repo.findOne.mockResolvedValue(null);
      const created = {
        id: "r3",
        ruleType: "sender_domain_and_subject_prefix",
        pattern: "@atlassian.net",
        subjectPrefix: "[JIRA]",
      };
      repo.create.mockReturnValue(created);
      repo.save.mockResolvedValue(created);

      await service.generateRuleFromEmail(
        userId,
        { from: "team@atlassian.net", subject: "[JIRA] Bug in login flow" },
        "JIRA",
      );

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ruleKind: "legacy",
          ruleType: "sender_domain_and_subject_prefix",
          pattern: "@atlassian.net",
          subjectPrefix: "[JIRA]",
        }),
      );
    });

    it("creates a subject_prefix rule for a generic domain sender with a prefix", async () => {
      repo.findOne.mockResolvedValue(null);
      const created = {
        id: "r4",
        ruleType: "subject_prefix",
        pattern: "[Newsletter]",
      };
      repo.create.mockReturnValue(created);
      repo.save.mockResolvedValue(created);

      await service.generateRuleFromEmail(
        userId,
        { from: "someone@gmail.com", subject: "[Newsletter] Weekly digest" },
        "Newsletters",
      );

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ruleKind: "legacy",
          ruleType: "subject_prefix",
          pattern: "[Newsletter]",
        }),
      );
    });

    it("returns null without creating a rule for generic domain with no prefix", async () => {
      const result = await service.generateRuleFromEmail(
        userId,
        { from: "friend@gmail.com", subject: "Hey, how are you?" },
        "Personal",
      );

      expect(repo.create).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it("returns existing rule without creating a duplicate", async () => {
      const existing = {
        id: "r5",
        categoryName: category,
        ruleKind: "legacy",
        ruleType: "sender_domain",
        pattern: "@github.com",
        patternHash: "abc123",
      };
      repo.findOne.mockResolvedValue(existing);

      const result = await service.generateRuleFromEmail(
        userId,
        { from: "notifications@github.com", subject: "New issue" },
        category,
      );

      expect(repo.create).not.toHaveBeenCalled();
      expect(result).toEqual(existing);
    });
  });

  // ---------------------------------------------------------------------------
  // findMatchingRule
  // ---------------------------------------------------------------------------

  describe("findMatchingRule", () => {
    const userId = "user-1";

    it("returns null when no rules exist", async () => {
      repo.find.mockResolvedValue([]);

      const match = await service.findMatchingRule(userId, {
        from: "notifications@github.com",
        subject: "New PR",
      });

      expect(match).toBeNull();
    });

    it("matches an exact_sender rule", async () => {
      // Build the patternHash inline using SHA-256 of "noreply@stripe.com"
      const hash = crypto
        .createHash("sha256")
        .update("noreply@stripe.com")
        .digest("hex");

      repo.find.mockResolvedValue([
        {
          id: "r1",
          ruleKind: "legacy",
          ruleType: "exact_sender",
          pattern: "noreply@stripe.com",
          patternHash: hash,
          categoryName: "Billing",
          subjectPrefix: null,
          isEnabled: true,
        },
      ]);
      repo.increment.mockResolvedValue({});

      const match = await service.findMatchingRule(userId, {
        from: "noreply@stripe.com",
        subject: "Your receipt",
      });

      expect(match).not.toBeNull();
      expect(match?.categoryName).toBe("Billing");
      expect(match?.ruleType).toBe("exact_sender");
      expect(match?.ruleKind).toBe("legacy");
    });

    it("matches a sender_domain rule", async () => {
      const hash = crypto
        .createHash("sha256")
        .update("@github.com")
        .digest("hex");

      repo.find.mockResolvedValue([
        {
          id: "r2",
          ruleKind: "legacy",
          ruleType: "sender_domain",
          pattern: "@github.com",
          patternHash: hash,
          categoryName: "GitHub Notifications",
          subjectPrefix: null,
          isEnabled: true,
        },
      ]);
      repo.increment.mockResolvedValue({});

      const match = await service.findMatchingRule(userId, {
        from: "Team GitHub <team@github.com>",
        subject: "New pull request opened",
      });

      expect(match?.categoryName).toBe("GitHub Notifications");
    });

    it("does not match a disabled rule", async () => {
      // isEnabled=false rules are excluded by the WHERE clause
      repo.find.mockResolvedValue([]);

      const match = await service.findMatchingRule(userId, {
        from: "notifications@github.com",
        subject: "New issue",
      });

      expect(match).toBeNull();
    });

    it("matches a composite rule when sender, subject, and body match", async () => {
      repo.find.mockResolvedValue([
        {
          id: "c1",
          ruleKind: "composite",
          ruleType: null,
          pattern: null,
          patternHash: null,
          categoryName: "QA",
          subjectPrefix: null,
          isEnabled: true,
          compositeSpec: {
            v: 1,
            sender: "notifications@github.com",
            subjectContains: "issue",
            bodyContainsAny: ["QA Passed", "QA Complete"],
          },
          createdAt: new Date("2024-01-01"),
        },
      ]);
      repo.increment.mockResolvedValue({});

      const match = await service.findMatchingRule(userId, {
        from: "notifications@github.com",
        subject: "Re: issue 123",
        bodyTextForMatch: "The workflow reports QA Passed on main.",
      });

      expect(match?.ruleKind).toBe("composite");
      expect(match?.categoryName).toBe("QA");
      expect(match?.ruleType).toBeNull();
    });

    it("composite rule wins before legacy when both match", async () => {
      const hash = crypto
        .createHash("sha256")
        .update("@github.com")
        .digest("hex");

      repo.find.mockResolvedValue([
        {
          id: "c1",
          ruleKind: "composite",
          ruleType: null,
          pattern: null,
          patternHash: null,
          categoryName: "QA Alerts",
          subjectPrefix: null,
          isEnabled: true,
          compositeSpec: {
            v: 1,
            sender: "notifications@github.com",
            subjectContains: "issue",
            bodyContainsAny: ["QA Passed"],
          },
          createdAt: new Date("2024-01-01"),
        },
        {
          id: "l1",
          ruleKind: "legacy",
          ruleType: "sender_domain",
          pattern: "@github.com",
          patternHash: hash,
          categoryName: "GitHub",
          subjectPrefix: null,
          isEnabled: true,
          createdAt: new Date("2024-06-01"),
        },
      ]);
      repo.increment.mockResolvedValue({});

      const match = await service.findMatchingRule(userId, {
        from: "notifications@github.com",
        subject: "[issue] update",
        bodyTextForMatch: "QA Passed",
      });

      expect(match?.ruleKind).toBe("composite");
      expect(match?.categoryName).toBe("QA Alerts");
    });

    it("does not match composite when bodyTextForMatch is missing", async () => {
      repo.find.mockResolvedValue([
        {
          id: "c1",
          ruleKind: "composite",
          ruleType: null,
          pattern: null,
          patternHash: null,
          categoryName: "QA",
          subjectPrefix: null,
          isEnabled: true,
          compositeSpec: {
            v: 1,
            sender: "a@b.com",
            subjectContains: "hi",
            bodyContainsAny: ["needle"],
          },
          createdAt: new Date(),
        },
      ]);
      repo.increment.mockResolvedValue({});

      const match = await service.findMatchingRule(userId, {
        from: "a@b.com",
        subject: "hi there",
      });

      expect(match).toBeNull();
    });
  });
});
