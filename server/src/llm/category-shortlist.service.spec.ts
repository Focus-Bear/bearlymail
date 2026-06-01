import { Test, TestingModule } from "@nestjs/testing";

import {
  type CategoryItem,
  CategoryShortlistService,
} from "./category-shortlist.service";
import { EmbeddingService } from "./embedding.service";

const VEC_DIM = 32;

/** A one-hot vector with a 1 at `index` — used as a deterministic category embedding. */
function oneHot(index: number): number[] {
  const vec = new Array(VEC_DIM).fill(0) as number[];
  vec[index] = 1;
  return vec;
}

/**
 * Build an email embedding whose cosine similarity to category i equals the
 * weight at index i. Higher weight → ranked higher in the shortlist.
 */
function emailVectorFavouring(
  weightsByIndex: Record<number, number>,
): number[] {
  const vec = new Array(VEC_DIM).fill(0) as number[];
  for (const [idx, weight] of Object.entries(weightsByIndex)) {
    vec[Number(idx)] = weight;
  }
  return vec;
}

const mockEmail = {
  from: "sender@example.com",
  fromName: "Sender Name",
  subject: "Test Email",
  summary: "This is a test email summary.",
};

const allCategories: CategoryItem[] = [
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
  let mockEmbeddingService: jest.Mocked<Partial<EmbeddingService>>;

  /**
   * Configure the embedding mock: category batches (cache:true) get one-hot
   * vectors by position; the single email embed returns `emailVector`.
   */
  function setupEmbeddings(emailVector: number[]): void {
    (mockEmbeddingService.isAvailable as jest.Mock).mockReturnValue(true);
    (mockEmbeddingService.embed as jest.Mock).mockImplementation(
      (texts: string[], options?: { cache?: boolean }) => {
        if (options?.cache) {
          return Promise.resolve(texts.map((_, i) => oneHot(i)));
        }
        return Promise.resolve([emailVector]);
      },
    );
  }

  beforeEach(async () => {
    mockEmbeddingService = {
      isAvailable: jest.fn().mockReturnValue(true),
      embed: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoryShortlistService,
        { provide: EmbeddingService, useValue: mockEmbeddingService },
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
      expect(mockEmbeddingService.embed).not.toHaveBeenCalled();
    });

    it("should return full list when embeddings are unavailable", async () => {
      (mockEmbeddingService.isAvailable as jest.Mock).mockReturnValue(false);
      const result = await service.getShortlist(mockEmail, allCategories);
      expect(result).toEqual(allCategories);
      expect(mockEmbeddingService.embed).not.toHaveBeenCalled();
    });

    it("should rank categories by cosine similarity to the email", async () => {
      // Favour Customer Support (0), Engineering (3), Security (11)
      setupEmbeddings(emailVectorFavouring({ 0: 3, 3: 2, 11: 1 }));

      const result = await service.getShortlist(mockEmail, allCategories, 3);

      expect(result.map((cat) => cat.name)).toEqual([
        "Customer Support",
        "Engineering",
        "Security",
      ]);
    });

    it("should never include Other", async () => {
      setupEmbeddings(emailVectorFavouring({ 0: 3, 3: 2 }));
      const result = await service.getShortlist(mockEmail, allCategories);
      expect(result.map((cat) => cat.name)).not.toContain("Other");
    });

    it("should cap the result at topN", async () => {
      setupEmbeddings(
        emailVectorFavouring({ 0: 9, 1: 8, 2: 7, 3: 6, 4: 5, 5: 4 }),
      );
      const result = await service.getShortlist(mockEmail, allCategories, 5);
      expect(result).toHaveLength(5);
    });

    it("should embed categories with caching enabled and the email without", async () => {
      setupEmbeddings(emailVectorFavouring({ 0: 1 }));
      await service.getShortlist(mockEmail, allCategories);

      const { calls } = (mockEmbeddingService.embed as jest.Mock).mock;
      const categoryCall = calls.find((call) => call[1]?.cache === true);
      const emailCall = calls.find((call) => !call[1]?.cache);
      expect(categoryCall).toBeDefined();
      expect(emailCall).toBeDefined();
      // Email embed receives exactly one text
      expect(emailCall?.[0]).toHaveLength(1);
    });

    it("should fall back to full list when embedding fails", async () => {
      (mockEmbeddingService.isAvailable as jest.Mock).mockReturnValue(true);
      (mockEmbeddingService.embed as jest.Mock).mockRejectedValue(
        new Error("embedding API unavailable"),
      );

      const result = await service.getShortlist(mockEmail, allCategories);
      expect(result).toEqual(allCategories);
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
    it("pins github categories even when they rank outside the top-N", async () => {
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

      // Favour the first 10 non-github categories so github ranks outside top-N
      setupEmbeddings(
        emailVectorFavouring({
          0: 10,
          1: 9,
          2: 8,
          3: 7,
          4: 6,
          5: 5,
          6: 4,
          7: 3,
          8: 2,
          9: 1,
        }),
      );

      const result = await service.getShortlist(githubEmail, githubCategories);

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

      setupEmbeddings(
        emailVectorFavouring({
          0: 10,
          1: 9,
          2: 8,
          3: 7,
          4: 6,
          5: 5,
          6: 4,
          7: 3,
          8: 2,
          9: 1,
        }),
      );

      const result = await service.getShortlist(
        regularEmail,
        categoriesWithGitHub,
      );

      expect(result.map((cat) => cat.name)).not.toContain("🐙 GitHub PRs");
    });
  });
});
