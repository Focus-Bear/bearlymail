import {
  buildLlmCategoryOutcome,
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

  it("records an UNCONFIDENT null category as awaiting summary re-categorisation", () => {
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
    expect(trace.steps[0].detail).toContain(
      "awaiting re-categorisation from the thread summary",
    );
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
