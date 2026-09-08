import {
  buildLlmCategoryOutcome,
  deterministicRuleDecisionTrace,
  llmDecisionTrace,
  localModelDecisionTrace,
} from "./category-decision-trace.helper";

describe("localModelDecisionTrace", () => {
  const prediction = {
    category: "CI/CD & QA Pipeline Failures",
    family: "GitHub / CI & Build",
    categoryConfidence: 0.96,
    categoryFallback: false,
    priorityBand: "high",
  };

  it("applies the model category as the final category", () => {
    const trace = localModelDecisionTrace({
      decidedAt: "2026-06-28T00:00:00.000Z",
      prediction,
      categoryId: "ci-id",
      finalCategoryId: "ci-id",
    });
    expect(trace.source).toBe("local");
    expect(trace.finalCategory).toBe("CI/CD & QA Pipeline Failures");
    expect(trace.finalCategoryId).toBe("ci-id");
    expect(trace.steps).toHaveLength(1);
    expect(trace.steps[0]).toMatchObject({
      step: "local-model",
      outcome: "applied",
      categoryId: "ci-id",
    });
  });

  it("records a confident null category (genuine Other) as a dead end, not uncertain", () => {
    const trace = localModelDecisionTrace({
      decidedAt: "2026-06-28T00:00:00.000Z",
      prediction: {
        ...prediction,
        category: "Other",
        family: "Other / Uncategorised",
        categoryFallback: false,
      },
      categoryId: null,
      finalCategoryId: null,
    });
    expect(trace.finalCategory).toBeNull();
    expect(trace.finalCategoryId).toBeNull();
    expect(trace.steps[0].category).toBeNull();
    expect(trace.steps[0].detail).toContain("matched no user category");
    expect(trace.steps[0].detail).not.toContain("re-categorised");
  });

  it("records an UNCONFIDENT null category as escalated to LLM categorisation", () => {
    const trace = localModelDecisionTrace({
      decidedAt: "2026-06-28T00:00:00.000Z",
      prediction: {
        ...prediction,
        category: "Some unsure guess",
        categoryFallback: true,
      },
      categoryId: null,
      finalCategoryId: null,
    });
    expect(trace.finalCategoryId).toBeNull();
    expect(trace.steps[0].category).toBeNull();
    expect(trace.steps[0].detail).toContain("escalated to LLM categorisation");
    expect(trace.steps[0].detail).not.toContain("matched no user category");
  });
});

describe("buildLlmCategoryOutcome", () => {
  it("uses the LLM categoryId as the final category id", () => {
    const outcome = buildLlmCategoryOutcome({
      decidedAt: "2026-06-28T00:00:00.000Z",
      finalCategory: "GitHub PR Updates",
      llmCategoryId: "pr-id",
      protoCategoryId: null,
      categoryExplanation: "because",
      rawLlmCategory: "GitHub PR Updates",
      llmProtoSuggestionName: null,
    });
    expect(outcome.categoryId).toBe("pr-id");
    expect(outcome.decisionTrace.steps).toHaveLength(1);
    expect(outcome.decisionTrace.steps[0]).toMatchObject({
      step: "llm",
      outcome: "applied",
    });
  });
});

describe("GitHub facts in the decision trace", () => {
  const GITHUB_FACTS =
    "GitHub facts: Item: issue #812 Focus-Bear/Mac-App · state: open · project status: QA passed (Mac App roadmap)";

  it("appends what the categoriser saw to the LLM step detail", () => {
    const trace = llmDecisionTrace({
      decidedAt: "2026-09-01T12:00:00.000Z",
      finalCategory: "✅ QA passed issues",
      llmCategoryId: "cat-1",
      protoCategoryId: null,
      finalCategoryId: "cat-1",
      githubFacts: GITHUB_FACTS,
    });

    expect(trace.steps[0].detail).toContain(
      'LLM categorisation resolved to "✅ QA passed issues".',
    );
    expect(trace.steps[0].detail).toContain(GITHUB_FACTS);
  });

  it("appends what the rule matcher saw to the deterministic-rule step detail", () => {
    const trace = deterministicRuleDecisionTrace({
      decidedAt: "2026-09-01T12:00:00.000Z",
      categoryName: "✅ QA passed issues",
      ruleCategoryId: "cat-1",
      finalCategoryId: "cat-1",
      githubFacts: "GitHub facts: none available",
    });

    expect(trace.steps[0].detail).toContain("GitHub facts: none available");
  });

  it("leaves the detail untouched for mail with no GitHub facts line", () => {
    const trace = llmDecisionTrace({
      decidedAt: "2026-09-01T12:00:00.000Z",
      finalCategory: "Billing",
      llmCategoryId: "cat-2",
      protoCategoryId: null,
      finalCategoryId: "cat-2",
    });

    expect(trace.steps[0].detail).toBe(
      'LLM categorisation resolved to "Billing".',
    );
  });
});
