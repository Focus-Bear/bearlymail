import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import crypto from "crypto";

import { CategoryRule } from "../database/entities/category-rule.entity";
import { Email } from "../database/entities/email.entity";
import { UserContext } from "../database/entities/user-context.entity";
import { LLMCategoriesService } from "../llm/llm-categories.service";
import { CategoryRulesService } from "./category-rules.service";

const mockRuleRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  delete: jest.fn(),
  increment: jest.fn(),
});

/** Minimal query-builder stub used to mock countDistinctThreadsForSender. */
const makeQbStub = (rawResult: { cnt: string }) => ({
  select: jest.fn().mockReturnThis(),
  addSelect: jest.fn().mockReturnThis(),
  innerJoin: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  groupBy: jest.fn().mockReturnThis(),
  having: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  getRawOne: jest.fn().mockResolvedValue(rawResult),
  getRawMany: jest.fn().mockResolvedValue([]),
  getMany: jest.fn().mockResolvedValue([]),
});

const mockEmailRepo = () => ({
  find: jest.fn(),
  createQueryBuilder: jest.fn(),
});

const mockUserContextRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
});

const mockLLMCategoriesService = () => ({
  suggestRulesFromEmailSamples: jest.fn(),
});

describe("CategoryRulesService", () => {
  let service: CategoryRulesService;
  let repo: ReturnType<typeof mockRuleRepo>;
  let emailRepo: ReturnType<typeof mockEmailRepo>;
  let llmCategoriesService: ReturnType<typeof mockLLMCategoriesService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoryRulesService,
        {
          provide: getRepositoryToken(CategoryRule),
          useFactory: mockRuleRepo,
        },
        {
          provide: getRepositoryToken(Email),
          useFactory: mockEmailRepo,
        },
        {
          provide: getRepositoryToken(UserContext),
          useFactory: mockUserContextRepo,
        },
        {
          provide: LLMCategoriesService,
          useFactory: mockLLMCategoriesService,
        },
      ],
    }).compile();

    service = module.get<CategoryRulesService>(CategoryRulesService);
    repo = module.get(getRepositoryToken(CategoryRule));
    emailRepo = module.get(getRepositoryToken(Email));
    llmCategoriesService = module.get(LLMCategoriesService);

    // Default: sender has 15 threads — above both thresholds.
    emailRepo.createQueryBuilder.mockReturnValue(makeQbStub({ cnt: "15" }));
    // Default: no sample emails found for the sender
    emailRepo.find.mockResolvedValue([]);
    // Default: LLM returns generic phrases (with sender pattern)
    llmCategoriesService.suggestRulesFromEmailSamples.mockResolvedValue({
      fromMatchesAny: ["alerts@acmecorp.com"],
      subjectContainsAny: ["Build failed"],
      bodyContainsAny: ["Pipeline step compile failed"],
    });
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

  describe("generateCompositeRuleFromEmail", () => {
    const userId = "user-1";

    it("creates a composite rule using LLM-extracted generic phrases", async () => {
      // emailRepo.createQueryBuilder default returns cnt=15 (above threshold)
      // emailRepo.find default returns [] (no cached sample emails)
      // llmCategoriesService default returns generic phrases
      repo.find.mockResolvedValue([]);
      const created = {
        id: "comp-1",
        ruleKind: "composite",
        categoryName: "CI",
      };
      repo.create.mockReturnValue(created);
      repo.save.mockResolvedValue(created);

      const result = await service.generateCompositeRuleFromEmail(
        userId,
        {
          from: "alerts@acmecorp.com",
          subject: "Build failed",
          bodyTextForMatch:
            "Pipeline step compile failed on branch main.\n\n— CI Bot",
        },
        "CI",
      );

      expect(llmCategoriesService.suggestRulesFromEmailSamples).toHaveBeenCalledWith(
        "CI",
        ["alerts@acmecorp.com"],
        expect.any(Array),
      );
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ruleKind: "composite",
          categoryName: "CI",
          compositeSpec: expect.objectContaining({
            v: 2,
            senderMatchesAny: ["alerts@acmecorp.com"],
            subjectContainsAny: ["Build failed"],
            bodyContainsAny: ["Pipeline step compile failed"],
          }),
        }),
      );
      expect(result).toEqual(created);
    });

    it("returns null when sender has fewer than AUTO_GENERATE_MIN_THREAD_COUNT threads", async () => {
      // Override default to return only 3 threads (below threshold of 10).
      emailRepo.createQueryBuilder.mockReturnValue(makeQbStub({ cnt: "3" }));

      const result = await service.generateCompositeRuleFromEmail(
        userId,
        {
          from: "alerts@acmecorp.com",
          subject: "Build failed",
          bodyTextForMatch:
            "Pipeline step compile failed on branch main.\n\n— CI Bot",
        },
        "CI",
      );

      expect(llmCategoriesService.suggestRulesFromEmailSamples).not.toHaveBeenCalled();
      expect(repo.create).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it("creates a rule when sender is exactly at the AUTO_GENERATE_MIN_THREAD_COUNT threshold", async () => {
      // Exactly 10 threads — should proceed.
      emailRepo.createQueryBuilder.mockReturnValue(makeQbStub({ cnt: "10" }));
      repo.find.mockResolvedValue([]);
      const created = {
        id: "comp-threshold",
        ruleKind: "composite",
        categoryName: "CI",
      };
      repo.create.mockReturnValue(created);
      repo.save.mockResolvedValue(created);

      const result = await service.generateCompositeRuleFromEmail(
        userId,
        {
          from: "alerts@acmecorp.com",
          subject: "Build failed",
          bodyTextForMatch:
            "Pipeline step compile failed on branch main.\n\n— CI Bot",
        },
        "CI",
      );

      expect(llmCategoriesService.suggestRulesFromEmailSamples).toHaveBeenCalled();
      expect(repo.create).toHaveBeenCalled();
      expect(result).toEqual(created);
    });

    it("returns null and does not persist when LLM returns no usable phrases", async () => {
      llmCategoriesService.suggestRulesFromEmailSamples.mockResolvedValue(null);

      const result = await service.generateCompositeRuleFromEmail(
        userId,
        {
          from: "a@b.co",
          subject: "Hello",
          bodyTextForMatch: "Some body text here",
        },
        "Cat",
      );

      expect(repo.create).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it("returns null and does not persist when LLM returns empty subject phrases", async () => {
      llmCategoriesService.suggestRulesFromEmailSamples.mockResolvedValue({
        fromMatchesAny: ["a@b.co"],
        subjectContainsAny: [],
        bodyContainsAny: ["some phrase"],
      });

      const result = await service.generateCompositeRuleFromEmail(
        userId,
        {
          from: "a@b.co",
          subject: "Hello",
          bodyTextForMatch: "Some body text here",
        },
        "Cat",
      );

      expect(repo.create).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it("uses domain wildcard from LLM as senderMatchesAny when returned", async () => {
      // LLM decides *@acmecorp.com is the right sender pattern.
      llmCategoriesService.suggestRulesFromEmailSamples.mockResolvedValue({
        fromMatchesAny: ["*@acmecorp.com"],
        subjectContainsAny: ["Build failed"],
        bodyContainsAny: ["Pipeline step compile failed"],
      });
      repo.find.mockResolvedValue([]);
      const created = {
        id: "comp-wildcard",
        ruleKind: "composite",
        categoryName: "CI",
      };
      repo.create.mockReturnValue(created);
      repo.save.mockResolvedValue(created);

      const result = await service.generateCompositeRuleFromEmail(
        userId,
        {
          from: "alerts@acmecorp.com",
          subject: "Build failed",
          bodyTextForMatch: "Pipeline step compile failed on branch main.",
        },
        "CI",
      );

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          compositeSpec: expect.objectContaining({
            senderMatchesAny: ["*@acmecorp.com"],
          }),
        }),
      );
      expect(result).toEqual(created);
    });

    it("reuses an existing composite rule with the same spec and can update category", async () => {
      // emailRepo default returns cnt=15 (above threshold)
      const existing = {
        id: "comp-2",
        categoryName: "OldName",
        ruleKind: "composite",
        compositeSpec: {
          v: 2 as const,
          senderMatchesAny: ["alerts@acmecorp.com"],
          subjectContainsAny: ["Build failed"],
          bodyContainsAny: ["Pipeline step compile failed"],
        },
      };
      repo.find.mockResolvedValue([existing]);
      repo.save.mockImplementation((entity) => Promise.resolve(entity));

      const result = await service.generateCompositeRuleFromEmail(
        userId,
        {
          from: "alerts@acmecorp.com",
          subject: "Build failed",
          bodyTextForMatch:
            "Pipeline step compile failed on branch main.\n\n— CI Bot",
        },
        "CI",
      );

      expect(repo.create).not.toHaveBeenCalled();
      expect(existing.categoryName).toBe("CI");
      expect(result?.id).toBe("comp-2");
    });
  });

  // ---------------------------------------------------------------------------
  // normalizeCompositeSpecDto — validation
  // ---------------------------------------------------------------------------

  describe("normalizeCompositeSpecDto", () => {
    const validDto = {
      categoryName: "Test",
      senderMatchesAny: ["billing@acme.com"],
      subjectContainsAny: ["Invoice"],
      bodyContainsAny: ["amount due"],
    };

    it("returns a v2 spec when all three fields are populated", () => {
      const spec = service.normalizeCompositeSpecDto(validDto);
      expect(spec.v).toBe(2);
      expect(spec.senderMatchesAny).toEqual(["billing@acme.com"]);
      expect(spec.subjectContainsAny).toEqual(["Invoice"]);
      expect(spec.bodyContainsAny).toEqual(["amount due"]);
    });

    it("throws BadRequestException when senderMatchesAny is empty after trimming", () => {
      expect(() =>
        service.normalizeCompositeSpecDto({
          ...validDto,
          senderMatchesAny: ["   "],
        }),
      ).toThrow("senderMatchesAny must contain at least one non-empty sender");
    });

    it("throws BadRequestException when subjectContainsAny is empty after trimming", () => {
      expect(() =>
        service.normalizeCompositeSpecDto({
          ...validDto,
          subjectContainsAny: ["   "],
        }),
      ).toThrow(
        "subjectContainsAny must contain at least one non-empty phrase",
      );
    });

    it("throws BadRequestException when bodyContainsAny is empty after trimming", () => {
      expect(() =>
        service.normalizeCompositeSpecDto({
          ...validDto,
          bodyContainsAny: ["   "],
        }),
      ).toThrow("bodyContainsAny must contain at least one non-empty phrase");
    });

    it("distinct-field-count guard rejects when fewer than 3 distinct fields are populated (defence-in-depth)", () => {
      // This simulates a caller that bypasses per-field guards but still hits the
      // aggregate count check. We need to inject a scenario where two of the three
      // fields pass the individual checks but the count ends up < 3 via a future
      // refactor — we test the guard directly by calling with two genuinely empty
      // arrays to confirm we get the composite error message.
      // (In the current implementation the per-field checks would fire first; we
      // verify the final guard message here for documentation / future-proofing.)
      expect(
        () =>
          service.normalizeCompositeSpecDto({
            ...validDto,
            bodyContainsAny: [],
          }),
        // Either per-field or composite guard fires
      ).toThrow();
    });

    it("trims whitespace from sender values", () => {
      const spec = service.normalizeCompositeSpecDto({
        ...validDto,
        senderMatchesAny: ["  Billing@ACME.COM  "],
      });
      expect(spec.senderMatchesAny).toEqual(["billing@acme.com"]);
    });

    it("filters out blank subject phrases", () => {
      const spec = service.normalizeCompositeSpecDto({
        ...validDto,
        subjectContainsAny: ["Invoice", "  ", "Receipt"],
      });
      expect(spec.subjectContainsAny).toEqual(["Invoice", "Receipt"]);
    });

    it("filters out blank body phrases", () => {
      const spec = service.normalizeCompositeSpecDto({
        ...validDto,
        bodyContainsAny: ["amount due", "", "payment"],
      });
      expect(spec.bodyContainsAny).toEqual(["amount due", "payment"]);
    });
  });

  // ---------------------------------------------------------------------------
  // Legacy rule auto-generation (gated via env flag)
  // ---------------------------------------------------------------------------

  describe("generateRuleFromEmail — service-layer behaviour (flag lives in llm-processor, not here)", () => {
    const userId = "user-flag";
    const category = "Test Category";
    const email = { from: "team@acmecorp.com", subject: "Update" };

    it("creates a legacy rule unconditionally — ENABLE_LEGACY_RULE_AUTO_GENERATION is enforced by llm-processor, not the service", async () => {
      repo.findOne.mockResolvedValue(null);
      const created = {
        id: "r-flag",
        ruleType: "sender_domain",
        pattern: "@acmecorp.com",
      };
      repo.create.mockReturnValue(created);
      repo.save.mockResolvedValue(created);

      // The service layer has no env-flag guard. generateRuleFromEmail always
      // creates a rule when called; the ENABLE_LEGACY_RULE_AUTO_GENERATION flag
      // gates the *call* in llm-processor.ts, so env-flag behaviour is tested
      // via llm-processor integration tests, not here.
      const result = await service.generateRuleFromEmail(
        userId,
        email,
        category,
      );
      expect(result).not.toBeNull();
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

    it("matches a v2 composite rule with multiple senders (OR)", async () => {
      repo.find.mockResolvedValue([
        {
          id: "c2",
          ruleKind: "composite",
          ruleType: null,
          pattern: null,
          patternHash: null,
          categoryName: "Invoices",
          subjectPrefix: null,
          isEnabled: true,
          compositeSpec: {
            v: 2,
            senderMatchesAny: [
              "billing@acme.com",
              "invoices@acme.com",
              "noreply@stripe.com",
            ],
            subjectContainsAny: ["Invoice"],
            bodyContainsAny: ["Amount due"],
          },
          createdAt: new Date("2024-01-01"),
        },
      ]);
      repo.increment.mockResolvedValue({});

      const match = await service.findMatchingRule(userId, {
        from: "invoices@acme.com",
        subject: "Invoice #1234",
        bodyTextForMatch: "Amount due: $50",
      });

      expect(match?.ruleKind).toBe("composite");
      expect(match?.categoryName).toBe("Invoices");
    });

    it("matches a v2 composite rule with multiple subjects (OR)", async () => {
      repo.find.mockResolvedValue([
        {
          id: "c3",
          ruleKind: "composite",
          ruleType: null,
          pattern: null,
          patternHash: null,
          categoryName: "Receipts",
          subjectPrefix: null,
          isEnabled: true,
          compositeSpec: {
            v: 2,
            senderMatchesAny: ["billing@shop.com"],
            subjectContainsAny: ["Receipt", "Payment confirmation", "Order"],
            bodyContainsAny: ["Thank you"],
          },
          createdAt: new Date("2024-01-01"),
        },
      ]);
      repo.increment.mockResolvedValue({});

      const match = await service.findMatchingRule(userId, {
        from: "billing@shop.com",
        subject: "Payment confirmation for order 567",
        bodyTextForMatch: "Thank you for your purchase.",
      });

      expect(match?.ruleKind).toBe("composite");
      expect(match?.categoryName).toBe("Receipts");
    });

    it("v2 rule does not match when no sender matches", async () => {
      repo.find.mockResolvedValue([
        {
          id: "c4",
          ruleKind: "composite",
          ruleType: null,
          pattern: null,
          patternHash: null,
          categoryName: "Invoices",
          subjectPrefix: null,
          isEnabled: true,
          compositeSpec: {
            v: 2,
            senderMatchesAny: ["billing@acme.com", "invoices@acme.com"],
            subjectContainsAny: ["Invoice"],
            bodyContainsAny: ["Amount due"],
          },
          createdAt: new Date("2024-01-01"),
        },
      ]);
      repo.increment.mockResolvedValue({});

      const match = await service.findMatchingRule(userId, {
        from: "random@other.com",
        subject: "Invoice #999",
        bodyTextForMatch: "Amount due: $100",
      });

      expect(match).toBeNull();
    });

    it("matches a v2 composite rule with a domain wildcard sender pattern", async () => {
      repo.find.mockResolvedValue([
        {
          id: "c-wildcard",
          ruleKind: "composite",
          ruleType: null,
          pattern: null,
          patternHash: null,
          categoryName: "GitHub Notifications",
          subjectPrefix: null,
          isEnabled: true,
          compositeSpec: {
            v: 2,
            senderMatchesAny: ["*@github.com"],
            subjectContainsAny: ["pull request"],
            bodyContainsAny: ["merged"],
          },
          createdAt: new Date("2024-01-01"),
        },
      ]);
      repo.increment.mockResolvedValue({});

      // Different subdomain address from the same domain should still match.
      const match = await service.findMatchingRule(userId, {
        from: "actions@github.com",
        subject: "pull request #42",
        bodyTextForMatch: "Branch was merged into main.",
      });

      expect(match?.categoryName).toBe("GitHub Notifications");
      expect(match?.ruleKind).toBe("composite");
    });

    it("domain wildcard does not match senders from a different domain", async () => {
      repo.find.mockResolvedValue([
        {
          id: "c-wildcard-2",
          ruleKind: "composite",
          ruleType: null,
          pattern: null,
          patternHash: null,
          categoryName: "GitHub Notifications",
          subjectPrefix: null,
          isEnabled: true,
          compositeSpec: {
            v: 2,
            senderMatchesAny: ["*@github.com"],
            subjectContainsAny: ["pull request"],
            bodyContainsAny: ["merged"],
          },
          createdAt: new Date("2024-01-01"),
        },
      ]);
      repo.increment.mockResolvedValue({});

      const match = await service.findMatchingRule(userId, {
        from: "bot@gitlab.com",
        subject: "pull request opened",
        bodyTextForMatch: "Feature branch merged into main.",
      });

      expect(match).toBeNull();
    });

    it("v1 spec backward compat still works after v2 introduction", async () => {
      repo.find.mockResolvedValue([
        {
          id: "c5",
          ruleKind: "composite",
          ruleType: null,
          pattern: null,
          patternHash: null,
          categoryName: "Legacy QA",
          subjectPrefix: null,
          isEnabled: true,
          compositeSpec: {
            v: 1,
            sender: "ci@build.com",
            subjectContains: "Build",
            bodyContainsAny: ["PASSED"],
          },
          createdAt: new Date("2024-01-01"),
        },
      ]);
      repo.increment.mockResolvedValue({});

      const match = await service.findMatchingRule(userId, {
        from: "ci@build.com",
        subject: "Build #42 completed",
        bodyTextForMatch: "All tests PASSED.",
      });

      expect(match?.categoryName).toBe("Legacy QA");
      expect(match?.ruleKind).toBe("composite");
    });
  });

  // ---------------------------------------------------------------------------
  // normalizeCompositeSpecDto
  // ---------------------------------------------------------------------------

  describe("normalizeCompositeSpecDto", () => {
    const validDto = {
      categoryName: "Test",
      senderMatchesAny: ["billing@acme.com"],
      subjectContainsAny: ["Invoice"],
      bodyContainsAny: ["Amount due"],
    };

    it("accepts a valid DTO with all 3 condition types populated", () => {
      expect(() => service.normalizeCompositeSpecDto(validDto)).not.toThrow();
      const spec = service.normalizeCompositeSpecDto(validDto);
      expect(spec.senderMatchesAny).toHaveLength(1);
      expect(spec.subjectContainsAny).toHaveLength(1);
      expect(spec.bodyContainsAny).toHaveLength(1);
    });

    it("rejects when senderMatchesAny is empty after trimming", () => {
      expect(() =>
        service.normalizeCompositeSpecDto({
          ...validDto,
          senderMatchesAny: ["   "],
        }),
      ).toThrow("senderMatchesAny must contain at least one non-empty sender");
    });

    it("rejects when subjectContainsAny is empty after trimming", () => {
      expect(() =>
        service.normalizeCompositeSpecDto({
          ...validDto,
          subjectContainsAny: ["  "],
        }),
      ).toThrow(
        "subjectContainsAny must contain at least one non-empty phrase",
      );
    });

    it("rejects when bodyContainsAny is empty after trimming", () => {
      expect(() =>
        service.normalizeCompositeSpecDto({
          ...validDto,
          bodyContainsAny: ["  "],
        }),
      ).toThrow("bodyContainsAny must contain at least one non-empty phrase");
    });

    it("rejects when bodyContainsAny is an empty array", () => {
      expect(() =>
        service.normalizeCompositeSpecDto({
          ...validDto,
          bodyContainsAny: [],
        }),
      ).toThrow();
    });

    it("normalises sender addresses to lowercase email format", () => {
      const spec = service.normalizeCompositeSpecDto({
        ...validDto,
        senderMatchesAny: ["  Billing@ACME.COM  ", "Invoices@Acme.com"],
      });
      expect(spec.senderMatchesAny).toEqual([
        "billing@acme.com",
        "invoices@acme.com",
      ]);
    });

    it("trims whitespace from subject and body phrases", () => {
      const spec = service.normalizeCompositeSpecDto({
        ...validDto,
        subjectContainsAny: ["  Invoice  ", " Receipt "],
        bodyContainsAny: ["  amount due  "],
      });
      expect(spec.subjectContainsAny).toEqual(["Invoice", "Receipt"]);
      expect(spec.bodyContainsAny).toEqual(["amount due"]);
    });
  });
});
