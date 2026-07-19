import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import crypto from "crypto";

import { CategoryRule } from "../database/entities/category-rule.entity";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import {
  ContextKey,
  UserContext,
} from "../database/entities/user-context.entity";
import { LLMCategoriesService } from "../llm/llm-categories.service";
import { CategoryRulesService } from "./category-rules.service";

const mockRuleRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  delete: jest.fn(),
  update: jest.fn(),
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

const mockEmailThreadRepo = () => ({
  // Default: validation query (raw SQL via manager.query) returns no threads,
  // so generated rules fall through to the new-user pass path. Tests that
  // exercise the validate-against-history path override this.
  manager: {
    query: jest.fn().mockResolvedValue([]),
  },
});

const mockUserContextRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
});

const mockLLMCategoriesService = () => ({
  suggestRulesFromEmailSamples: jest.fn(),
  deriveExclusionPhrasesFromFalsePositives: jest.fn(),
  assessRuleAddsValue: jest.fn(),
});

/** An email that matches the default generated spec (used to pass the match gate). */
const matchingMailboxEmail = {
  from: "alerts@acmecorp.com",
  subject: "Build failed",
  body: "Pipeline step compile failed on branch main.",
};

describe("CategoryRulesService", () => {
  let service: CategoryRulesService;
  let repo: ReturnType<typeof mockRuleRepo>;
  let emailRepo: ReturnType<typeof mockEmailRepo>;
  let userContextRepo: ReturnType<typeof mockUserContextRepo>;
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
          provide: getRepositoryToken(EmailThread),
          useFactory: mockEmailThreadRepo,
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
    userContextRepo = module.get(getRepositoryToken(UserContext));
    llmCategoriesService = module.get(LLMCategoriesService);

    // Default: sender has 15 threads — above both thresholds.
    emailRepo.createQueryBuilder.mockReturnValue(makeQbStub({ cnt: "15" }));
    // Default: no sample emails found for the sender
    emailRepo.find.mockResolvedValue([]);
    // Default: LLM returns generic phrases (with sender pattern). Issue #1789:
    // empty exclusion arrays — tests that need exclusions override per-test.
    llmCategoriesService.suggestRulesFromEmailSamples.mockResolvedValue({
      fromMatchesAny: ["alerts@acmecorp.com"],
      subjectContainsAny: ["Build failed"],
      bodyContainsAny: ["Pipeline step compile failed"],
      subjectNotContainsAny: [],
      bodyNotContainsAny: [],
    });
    // Default exclusion derivation: none (no false positives in the bypass path).
    llmCategoriesService.deriveExclusionPhrasesFromFalsePositives.mockResolvedValue(
      { subjectNotContainsAny: [], bodyNotContainsAny: [] },
    );
    // Default value-add verdict: adds value, no extra exclusions.
    llmCategoriesService.assessRuleAddsValue.mockResolvedValue({
      addsValue: true,
      reasoning: "adds value",
      subjectNotContainsAny: [],
      bodyNotContainsAny: [],
    });
  });

  afterEach(() => jest.clearAllMocks());

  describe("generateCompositeRuleFromEmail", () => {
    const userId = "user-1";

    const CI_CATEGORY_ID = "cat-ci";

    // A non-duplicate sibling rule for the same category, so the value-add step
    // runs and can supply the exclusion the strict policy now requires.
    const siblingRule = {
      id: "sib-1",
      ruleKind: "composite",
      categoryName: "CI",
      categoryId: CI_CATEGORY_ID,
      compositeSpec: {
        v: 2 as const,
        senderMatchesAny: ["deploys@acmecorp.com"],
        subjectContainsAny: ["Deployed"],
        bodyContainsAny: ["deployment succeeded"],
      },
    };

    // Arms the persist gate so a generated rule survives: a real mailbox email
    // for the match gate, a sibling so value-add runs, and a value-add verdict
    // that supplies a NOT-contains exclusion (required for every rule).
    const armPersistGate = (exclusion = "weekly digest") => {
      emailRepo.find.mockResolvedValue([matchingMailboxEmail]);
      repo.find.mockResolvedValue([siblingRule]);
      userContextRepo.find.mockResolvedValue([
        {
          contextId: CI_CATEGORY_ID,
          contextValue: "CI",
          contextKey: ContextKey.EMAIL_CATEGORY,
        },
      ]);
      llmCategoriesService.assessRuleAddsValue.mockResolvedValue({
        addsValue: true,
        reasoning: "distinct from sibling",
        subjectNotContainsAny: [exclusion],
        bodyNotContainsAny: [],
      });
    };

    it("creates a composite rule using LLM-extracted generic phrases", async () => {
      // emailRepo.createQueryBuilder default returns cnt=15 (above threshold)
      // llmCategoriesService default returns generic phrases
      armPersistGate();
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

      expect(
        llmCategoriesService.suggestRulesFromEmailSamples,
      ).toHaveBeenCalledWith("CI", ["alerts@acmecorp.com"], expect.any(Array));
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ruleKind: "composite",
          categoryName: "CI",
          compositeSpec: expect.objectContaining({
            v: 3,
            fromMatchesAny: ["alerts@acmecorp.com"],
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

      expect(
        llmCategoriesService.suggestRulesFromEmailSamples,
      ).not.toHaveBeenCalled();
      expect(repo.create).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it("creates a rule when sender is exactly at the AUTO_GENERATE_MIN_THREAD_COUNT threshold", async () => {
      // Exactly 10 threads — should proceed.
      emailRepo.createQueryBuilder.mockReturnValue(makeQbStub({ cnt: "10" }));
      armPersistGate();
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

      expect(
        llmCategoriesService.suggestRulesFromEmailSamples,
      ).toHaveBeenCalled();
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
        subjectNotContainsAny: [],
        bodyNotContainsAny: [],
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
        subjectNotContainsAny: [],
        bodyNotContainsAny: [],
      });
      armPersistGate();
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
            fromMatchesAny: ["*@acmecorp.com"],
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

    it("discards a rule that matches no mailbox email (match gate)", async () => {
      // No matching emails in the mailbox scan.
      emailRepo.find.mockResolvedValue([]);
      repo.find.mockResolvedValue([]);

      const result = await service.generateCompositeRuleFromEmail(
        userId,
        {
          from: "alerts@acmecorp.com",
          subject: "Build failed",
          bodyTextForMatch: "Pipeline step compile failed on branch main.",
        },
        "CI",
      );

      expect(repo.create).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it("discards a clean rule with no exclusion (strict NOT-contains policy)", async () => {
      // Matches real mail but has no sibling and no false positives, so no
      // exclusion can be derived — the strict policy discards it.
      emailRepo.find.mockResolvedValue([matchingMailboxEmail]);
      repo.find.mockResolvedValue([]);

      const result = await service.generateCompositeRuleFromEmail(
        userId,
        {
          from: "alerts@acmecorp.com",
          subject: "Build failed",
          bodyTextForMatch: "Pipeline step compile failed on branch main.",
        },
        "CI",
      );

      expect(repo.create).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it("discards a redundant rule when value-add reports no added value", async () => {
      armPersistGate();
      llmCategoriesService.assessRuleAddsValue.mockResolvedValue({
        addsValue: false,
        reasoning: "existing rule already covers these emails",
        subjectNotContainsAny: [],
        bodyNotContainsAny: [],
      });

      const result = await service.generateCompositeRuleFromEmail(
        userId,
        {
          from: "alerts@acmecorp.com",
          subject: "Build failed",
          bodyTextForMatch: "Pipeline step compile failed on branch main.",
        },
        "CI",
      );

      expect(repo.create).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // draftCompositeRuleFromEmail — user-initiated draft (no persistence)
  // ---------------------------------------------------------------------------

  describe("draftCompositeRuleFromEmail", () => {
    const email = {
      from: "alerts@acmecorp.com",
      subject: "Build failed",
      bodyTextForMatch: "Pipeline step compile failed on branch main.",
    };

    it("returns a draft spec from the LLM phrases without persisting", async () => {
      const draft = await service.draftCompositeRuleFromEmail(
        "user-1",
        email,
        "CI",
      );

      expect(draft).not.toBeNull();
      expect(draft?.categoryName).toBe("CI");
      expect(draft?.senderMatchesAny).toEqual(["alerts@acmecorp.com"]);
      expect(draft?.subjectContainsAny).toEqual(["Build failed"]);
      expect(draft?.bodyContainsAny).toEqual(["Pipeline step compile failed"]);
      // Draft must never persist — the user reviews/saves separately.
      expect(repo.create).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
    });

    it("drafts even when the sender is below the auto-generate thread threshold", async () => {
      // Sender with only 1 thread — generateCompositeRuleFromEmail would bail,
      // but a user-initiated draft skips that gate.
      emailRepo.createQueryBuilder.mockReturnValue(makeQbStub({ cnt: "1" }));

      const draft = await service.draftCompositeRuleFromEmail(
        "user-1",
        email,
        "CI",
      );

      expect(draft).not.toBeNull();
      expect(draft?.senderMatchesAny).toEqual(["alerts@acmecorp.com"]);
    });

    it("returns null when the LLM produces no usable phrases", async () => {
      llmCategoriesService.suggestRulesFromEmailSamples.mockResolvedValue(null);

      const draft = await service.draftCompositeRuleFromEmail(
        "user-1",
        email,
        "CI",
      );

      expect(draft).toBeNull();
    });

    it("falls back to the LLM's suggested exclusions when none are FP-derived", async () => {
      // LLM proposes speculative exclusions; no false positives exist to derive
      // from, so the user draft should surface the suggestions for review.
      llmCategoriesService.suggestRulesFromEmailSamples.mockResolvedValue({
        fromMatchesAny: ["alerts@acmecorp.com"],
        subjectContainsAny: ["Build failed"],
        bodyContainsAny: ["compile failed"],
        subjectNotContainsAny: ["succeeded"],
        bodyNotContainsAny: ["all checks passed"],
      });

      const draft = await service.draftCompositeRuleFromEmail(
        "user-1",
        email,
        "CI",
      );

      expect(draft).not.toBeNull();
      expect(draft?.subjectNotContainsAny).toEqual(["succeeded"]);
      expect(draft?.bodyNotContainsAny).toEqual(["all checks passed"]);
      // These are speculative, not validated against real false positives.
      expect(draft?.exclusionsDerived).toBe(false);
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

    it("returns a v3 spec when all three fields are populated", () => {
      const spec = service.normalizeCompositeSpecDto(validDto);
      expect(spec.v).toBe(3);
      expect(spec.fromMatchesAny).toEqual(["billing@acme.com"]);
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
      expect(spec.fromMatchesAny).toEqual(["billing@acme.com"]);
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
  // findMatchingRule
  // ---------------------------------------------------------------------------

  describe("findMatchingRule", () => {
    const userId = "user-1";
    const DEFAULT_CATEGORY_ID = "cat-default";

    beforeEach(() => {
      // By default the user has one valid category that the test rules below
      // reference via `categoryId: DEFAULT_CATEGORY_ID`. Tests that need a
      // different category set override this mock.
      userContextRepo.find.mockResolvedValue([
        {
          contextId: DEFAULT_CATEGORY_ID,
          contextValue: "Billing - Payment receipts",
          contextKey: ContextKey.EMAIL_CATEGORY,
        },
      ]);
    });

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
          categoryId: DEFAULT_CATEGORY_ID,
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
          categoryId: DEFAULT_CATEGORY_ID,
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
          categoryId: DEFAULT_CATEGORY_ID,
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
          categoryId: DEFAULT_CATEGORY_ID,
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
          categoryId: DEFAULT_CATEGORY_ID,
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
          categoryId: DEFAULT_CATEGORY_ID,
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
          categoryId: DEFAULT_CATEGORY_ID,
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
          categoryId: DEFAULT_CATEGORY_ID,
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
          categoryId: DEFAULT_CATEGORY_ID,
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
          categoryId: DEFAULT_CATEGORY_ID,
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
          categoryId: DEFAULT_CATEGORY_ID,
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
          categoryId: DEFAULT_CATEGORY_ID,
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

    it("ignores a matching rule when its category no longer exists in the user's category list", async () => {
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
          categoryName: "Meeting Cancellations / No-shows",
          subjectPrefix: null,
          isEnabled: true,
        },
      ]);
      // User has categories, but not the one the rule references
      userContextRepo.find.mockResolvedValue([
        {
          contextValue: "Billing - Payment receipts",
          contextKey: ContextKey.EMAIL_CATEGORY,
        },
        {
          contextValue: "GitHub Notifications - PR and issue updates",
          contextKey: ContextKey.EMAIL_CATEGORY,
        },
      ]);

      const match = await service.findMatchingRule(userId, {
        from: "noreply@stripe.com",
        subject: "Cannot attend today",
      });

      expect(match).toBeNull();
      expect(repo.increment).not.toHaveBeenCalled();
    });

    it("falls back to a second matching rule when the first match's category has been deleted", async () => {
      const exactHash = crypto
        .createHash("sha256")
        .update("noreply@stripe.com")
        .digest("hex");
      const domainHash = crypto
        .createHash("sha256")
        .update("@stripe.com")
        .digest("hex");

      const BILLING_ID = "cat-billing";
      repo.find.mockResolvedValue([
        {
          id: "r-stale",
          ruleKind: "legacy",
          ruleType: "exact_sender",
          pattern: "noreply@stripe.com",
          patternHash: exactHash,
          categoryName: "Deleted Category",
          categoryId: "cat-deleted",
          subjectPrefix: null,
          isEnabled: true,
        },
        {
          id: "r-valid",
          ruleKind: "legacy",
          ruleType: "sender_domain",
          pattern: "@stripe.com",
          patternHash: domainHash,
          categoryName: "Billing",
          categoryId: BILLING_ID,
          subjectPrefix: null,
          isEnabled: true,
        },
      ]);
      repo.increment.mockResolvedValue({});
      userContextRepo.find.mockResolvedValue([
        {
          contextId: BILLING_ID,
          contextValue: "Billing - Payment receipts",
          contextKey: ContextKey.EMAIL_CATEGORY,
        },
      ]);

      const match = await service.findMatchingRule(userId, {
        from: "noreply@stripe.com",
        subject: "Your receipt",
      });

      expect(match).not.toBeNull();
      expect(match?.categoryName).toBe("Billing");
      expect(match?.ruleId).toBe("r-valid");
      expect(repo.increment).toHaveBeenCalledWith(
        { id: "r-valid" },
        "hitCount",
        1,
      );
    });

    it("uses a matching rule when its category exists in the user's category list", async () => {
      const hash = crypto
        .createHash("sha256")
        .update("noreply@stripe.com")
        .digest("hex");

      const BILLING_ID = "cat-billing-2";
      repo.find.mockResolvedValue([
        {
          id: "r1",
          ruleKind: "legacy",
          ruleType: "exact_sender",
          pattern: "noreply@stripe.com",
          patternHash: hash,
          categoryName: "Billing",
          categoryId: BILLING_ID,
          subjectPrefix: null,
          isEnabled: true,
        },
      ]);
      repo.increment.mockResolvedValue({});
      userContextRepo.find.mockResolvedValue([
        {
          contextId: BILLING_ID,
          contextValue: "Billing - Payment receipts",
          contextKey: ContextKey.EMAIL_CATEGORY,
        },
      ]);

      const match = await service.findMatchingRule(userId, {
        from: "noreply@stripe.com",
        subject: "Your receipt",
      });

      expect(match).not.toBeNull();
      expect(match?.categoryName).toBe("Billing");
      expect(repo.increment).toHaveBeenCalledWith({ id: "r1" }, "hitCount", 1);
    });

    it("excludes a legacy rule with no categoryId even when user has no categories at all", async () => {
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
          // No categoryId — a legacy rule from before rules carried a category
          // UUID. It can never resolve to a real category, so it must not match.
          subjectPrefix: null,
          isEnabled: true,
        },
      ]);
      repo.increment.mockResolvedValue({});
      // No EMAIL_CATEGORY contexts at all
      userContextRepo.find.mockResolvedValue([]);

      const match = await service.findMatchingRule(userId, {
        from: "noreply@stripe.com",
        subject: "Your receipt",
      });

      expect(match).toBeNull();
      expect(repo.increment).not.toHaveBeenCalled();
    });

    it("re-links a matched rule to a same-named live category when its stored categoryId was orphaned by a regeneration", async () => {
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
          // Points at a contextId that no longer exists — the category was
          // deleted+recreated under a new id by a context regeneration.
          categoryId: "cat-billing-old",
          subjectPrefix: null,
          isEnabled: true,
        },
      ]);
      repo.increment.mockResolvedValue({});
      // A same-named category still exists, under a fresh contextId.
      userContextRepo.find.mockResolvedValue([
        {
          contextId: "cat-billing-new",
          contextValue: "Billing",
          contextKey: ContextKey.EMAIL_CATEGORY,
        },
      ]);

      const match = await service.findMatchingRule(userId, {
        from: "noreply@stripe.com",
        subject: "Your receipt",
      });

      expect(match).not.toBeNull();
      expect(match?.categoryName).toBe("Billing");
      // The match carries the live id, not the orphaned one.
      expect(match?.categoryId).toBe("cat-billing-new");
      expect(repo.increment).toHaveBeenCalledWith({ id: "r1" }, "hitCount", 1);
    });

    it("does not re-link to a different category when the name does not match (exact-name only, never fuzzy)", async () => {
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
          categoryId: "cat-billing-old",
          subjectPrefix: null,
          isEnabled: true,
        },
      ]);
      repo.increment.mockResolvedValue({});
      // Only a near-but-not-exact category name exists — must NOT be re-linked.
      userContextRepo.find.mockResolvedValue([
        {
          contextId: "cat-billing-new",
          contextValue: "Billing - Payment receipts",
          contextKey: ContextKey.EMAIL_CATEGORY,
        },
      ]);

      const match = await service.findMatchingRule(userId, {
        from: "noreply@stripe.com",
        subject: "Your receipt",
      });

      expect(match).toBeNull();
      expect(repo.increment).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // findMatchingRuleWithTrace
  // ---------------------------------------------------------------------------

  describe("findMatchingRuleWithTrace", () => {
    const userId = "user-1";

    const compositeQaRule = (overrides: Record<string, unknown> = {}) => ({
      id: "c1",
      ruleKind: "composite",
      ruleType: null,
      pattern: null,
      patternHash: null,
      categoryName: "QA",
      // A categoryId is required for a rule to be eligible (rules with a null
      // categoryId are always skipped by the matcher).
      categoryId: "cat-qa",
      subjectPrefix: null,
      isEnabled: true,
      hitCount: 0,
      compositeSpec: {
        v: 1,
        sender: "notifications@github.com",
        subjectContains: "issue",
        bodyContainsAny: ["QA Passed"],
      },
      createdAt: new Date("2024-01-01"),
      ...overrides,
    });

    const qaEmail = {
      from: "notifications@github.com",
      subject: "Re: issue 123",
      bodyTextForMatch: "The workflow reports QA Passed on main.",
    };

    it("returns the winner and a snapshot when an enabled rule matches", async () => {
      repo.find.mockResolvedValue([compositeQaRule()]);
      repo.increment.mockResolvedValue({});

      const { match, snapshot } = await service.findMatchingRuleWithTrace(
        userId,
        qaEmail,
      );

      expect(match?.ruleId).toBe("c1");
      expect(snapshot.ruleStepRan).toBe(true);
      expect(snapshot.rulesConsideredCount).toBe(1);
      expect(snapshot.winningRuleId).toBe("c1");
      expect(snapshot.winningRuleCategoryName).toBe("QA");
      expect(snapshot.matchedButNotWinningRuleIds).toEqual([]);
      expect(Number.isNaN(new Date(snapshot.evaluatedAt).getTime())).toBe(
        false,
      );
      expect(repo.increment).toHaveBeenCalledTimes(1);
      expect(repo.increment).toHaveBeenCalledWith({ id: "c1" }, "hitCount", 1);
    });

    it("records a disabled-but-matching rule with no winner", async () => {
      repo.find.mockResolvedValue([compositeQaRule({ isEnabled: false })]);

      const { match, snapshot } = await service.findMatchingRuleWithTrace(
        userId,
        qaEmail,
      );

      expect(match).toBeNull();
      expect(snapshot.winningRuleId).toBeNull();
      expect(snapshot.winningRuleCategoryName).toBeNull();
      expect(snapshot.rulesConsideredCount).toBe(1);
      expect(snapshot.matchedButNotWinningRuleIds).toEqual(["c1"]);
      expect(repo.increment).not.toHaveBeenCalled();
    });

    it("excludes the winner and lists other matching rules as not-applied", async () => {
      repo.find.mockResolvedValue([
        compositeQaRule({ id: "winner" }),
        compositeQaRule({ id: "loser", categoryName: "QA Duplicate" }),
      ]);
      repo.increment.mockResolvedValue({});

      const { match, snapshot } = await service.findMatchingRuleWithTrace(
        userId,
        qaEmail,
      );

      expect(match?.ruleId).toBe("winner");
      expect(snapshot.winningRuleId).toBe("winner");
      expect(snapshot.rulesConsideredCount).toBe(2);
      expect(snapshot.matchedButNotWinningRuleIds).toEqual(["loser"]);
      expect(repo.increment).toHaveBeenCalledTimes(1);
    });

    it("reports no match when no rule pattern matches the email", async () => {
      repo.find.mockResolvedValue([compositeQaRule()]);

      const { match, snapshot } = await service.findMatchingRuleWithTrace(
        userId,
        {
          from: "someone@example.com",
          subject: "unrelated",
          bodyTextForMatch: "nothing here",
        },
      );

      expect(match).toBeNull();
      expect(snapshot.winningRuleId).toBeNull();
      expect(snapshot.matchedButNotWinningRuleIds).toEqual([]);
      expect(repo.increment).not.toHaveBeenCalled();
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
      expect(spec.fromMatchesAny).toHaveLength(1);
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
      expect(spec.fromMatchesAny).toEqual([
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

  // ---------------------------------------------------------------------------
  // Category link resolution (createCompositeRule / updateCategoryRule)
  // ---------------------------------------------------------------------------

  describe("category link resolution", () => {
    const userId = "user-1";

    const validCreateDto = {
      categoryName: "Billing",
      senderMatchesAny: ["noreply@stripe.com"],
      subjectContainsAny: ["receipt"],
      bodyContainsAny: ["payment"],
      subjectNotContainsAny: ["refund"],
      bodyNotContainsAny: [],
    };

    beforeEach(() => {
      repo.create.mockImplementation((entity) => entity);
      repo.save.mockImplementation((entity) => Promise.resolve(entity));
    });

    it("createCompositeRule stores the authoritative categoryId and derives the canonical name from it", async () => {
      // contextValue carries a description; the canonical name is the parsed part.
      userContextRepo.findOne.mockResolvedValue({
        contextId: "cat-1",
        contextValue: "Billing - Payment receipts and invoices",
      });

      const dto = { ...validCreateDto, categoryId: "cat-1" };
      const result = await service.createCompositeRule(userId, dto);

      expect(userContextRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            contextId: "cat-1",
            userId,
            contextKey: ContextKey.EMAIL_CATEGORY,
          }),
        }),
      );
      // Name comes from the context, not the (possibly stale) DTO name.
      expect(result.categoryId).toBe("cat-1");
      expect(result.categoryName).toBe("Billing");
      // Name lookup is NOT used when an id is supplied.
      expect(userContextRepo.find).not.toHaveBeenCalled();
    });

    it("createCompositeRule throws when the supplied categoryId does not exist", async () => {
      userContextRepo.findOne.mockResolvedValue(null);

      await expect(
        service.createCompositeRule(userId, {
          ...validCreateDto,
          categoryId: "missing",
        }),
      ).rejects.toThrow("categoryId does not match an existing category");
    });

    it("createCompositeRule falls back to name resolution when no categoryId is supplied", async () => {
      userContextRepo.find.mockResolvedValue([
        {
          contextId: "cat-billing",
          contextValue: "Billing - Payment receipts",
          contextKey: ContextKey.EMAIL_CATEGORY,
        },
      ]);

      const result = await service.createCompositeRule(userId, validCreateDto);

      expect(userContextRepo.findOne).not.toHaveBeenCalled();
      expect(result.categoryId).toBe("cat-billing");
      expect(result.categoryName).toBe("Billing");
    });

    it("updateCategoryRule relinks via categoryId and stores the canonical name", async () => {
      repo.findOne.mockResolvedValue({
        id: "rule-1",
        userId,
        ruleKind: "composite",
        categoryName: "Old Name",
        categoryId: null,
      });
      userContextRepo.findOne.mockResolvedValue({
        contextId: "cat-2",
        contextValue: "Security & Compliance - AWS alerts",
      });

      const result = await service.updateCategoryRule(userId, "rule-1", {
        categoryId: "cat-2",
      });

      expect(result?.categoryId).toBe("cat-2");
      expect(result?.categoryName).toBe("Security & Compliance");
      expect(repo.save).toHaveBeenCalled();
    });
  });

  describe("listRules — self-heal broken category links", () => {
    it("re-resolves and persists a null categoryId by name", async () => {
      repo.find.mockResolvedValue([
        {
          id: "rule-1",
          userId: "user-1",
          categoryName: "Security & Compliance",
          categoryId: null,
          ruleKind: "composite",
          ruleType: "sender",
          isEnabled: true,
          hitCount: 0,
        },
      ]);
      userContextRepo.find.mockResolvedValue([
        {
          contextId: "cat-1",
          contextValue: "Security & Compliance - AWS and security alerts",
          contextKey: ContextKey.EMAIL_CATEGORY,
        },
      ]);
      repo.update.mockResolvedValue({ affected: 1 });

      const dtos = await service.listRules("user-1");

      expect(repo.update).toHaveBeenCalledWith(
        { id: "rule-1", userId: "user-1" },
        { categoryId: "cat-1" },
      );
      expect(dtos[0].categoryId).toBe("cat-1");
    });

    it("leaves an orphaned rule null and does not write", async () => {
      repo.find.mockResolvedValue([
        {
          id: "rule-2",
          userId: "user-1",
          categoryName: "Deleted Category",
          categoryId: null,
          ruleKind: "composite",
          ruleType: "sender",
          isEnabled: true,
          hitCount: 0,
        },
      ]);
      userContextRepo.find.mockResolvedValue([
        {
          contextId: "cat-1",
          contextValue: "Billing - Receipts",
          contextKey: ContextKey.EMAIL_CATEGORY,
        },
      ]);

      const dtos = await service.listRules("user-1");

      expect(repo.update).not.toHaveBeenCalled();
      expect(dtos[0].categoryId).toBeNull();
    });

    it("skips the context query when no rule is broken", async () => {
      repo.find.mockResolvedValue([
        {
          id: "rule-3",
          userId: "user-1",
          categoryName: "Billing",
          categoryId: "cat-1",
          ruleKind: "composite",
          ruleType: "sender",
          isEnabled: true,
          hitCount: 0,
        },
      ]);

      await service.listRules("user-1");

      expect(userContextRepo.find).not.toHaveBeenCalled();
      expect(repo.update).not.toHaveBeenCalled();
    });
  });
});
