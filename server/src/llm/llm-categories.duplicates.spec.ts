import { Test, TestingModule } from "@nestjs/testing";

import { LLMCategoriesService } from "./llm-categories.service";
import { LLMCoreService } from "./llm-core.service";

describe("LLMCategoriesService.identifyDuplicateCategories", () => {
  let service: LLMCategoriesService;
  let generateText: jest.Mock;

  const categories = [
    { name: "🔧 GitHub PR Updates", description: "PR updates" },
    { name: "Pull Request Updates", description: "PR activity" },
    { name: "🐛 Bug Issues", description: "bugs" },
  ];

  const setResponse = (response: string) =>
    generateText.mockResolvedValueOnce(response);

  beforeEach(async () => {
    generateText = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LLMCategoriesService,
        { provide: LLMCoreService, useValue: { generateText } },
      ],
    }).compile();
    service = module.get(LLMCategoriesService);
  });

  it("returns valid duplicate groups, mapping names verbatim", async () => {
    setResponse(
      JSON.stringify({
        duplicate_groups: [
          {
            canonical: "🔧 GitHub PR Updates",
            members: ["🔧 GitHub PR Updates", "pull request updates"],
          },
        ],
      }),
    );

    const groups = await service.identifyDuplicateCategories("Fam", categories);

    expect(groups).toEqual([
      {
        canonical: "🔧 GitHub PR Updates",
        members: ["🔧 GitHub PR Updates", "Pull Request Updates"],
      },
    ]);
  });

  it("drops members the LLM hallucinated (not in the input list)", async () => {
    setResponse(
      JSON.stringify({
        duplicate_groups: [
          {
            canonical: "🔧 GitHub PR Updates",
            members: ["🔧 GitHub PR Updates", "Totally Made Up Category"],
          },
        ],
      }),
    );

    // Only one real member remains → group dropped.
    const groups = await service.identifyDuplicateCategories("Fam", categories);
    expect(groups).toEqual([]);
  });

  it("falls back to the first member when canonical is invalid", async () => {
    setResponse(
      JSON.stringify({
        duplicate_groups: [
          {
            canonical: "not a real name",
            members: ["🔧 GitHub PR Updates", "Pull Request Updates"],
          },
        ],
      }),
    );

    const groups = await service.identifyDuplicateCategories("Fam", categories);
    expect(groups[0].canonical).toBe("🔧 GitHub PR Updates");
  });

  it("handles markdown-fenced JSON", async () => {
    setResponse(
      '```json\n{"duplicate_groups":[{"canonical":"🐛 Bug Issues","members":["🐛 Bug Issues","🔧 GitHub PR Updates"]}]}\n```',
    );
    const groups = await service.identifyDuplicateCategories("Fam", categories);
    expect(groups).toHaveLength(1);
  });

  it("returns [] for unparseable output", async () => {
    setResponse("the model said no");
    const groups = await service.identifyDuplicateCategories("Fam", categories);
    expect(groups).toEqual([]);
  });

  it("never calls the LLM for a single category", async () => {
    const groups = await service.identifyDuplicateCategories("Fam", [
      categories[0],
    ]);
    expect(groups).toEqual([]);
    expect(generateText).not.toHaveBeenCalled();
  });
});
