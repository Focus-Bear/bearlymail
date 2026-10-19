import { JEV_DECISION_PROVIDER } from "../constants/ai-decision-provider.constants";
import { PRIORITY_SCORE_SOURCE } from "../constants/priority-rule.constants";
import { LLMProvider } from "../llm/llm.types";
import {
  deriveCategorizationProvider,
  derivePriorityProvider,
  toPriorityScoreSource,
} from "./decision-provider.helper";

describe("deriveCategorizationProvider", () => {
  it("returns the stored provider for an AI-decided category", () => {
    expect(
      deriveCategorizationProvider({
        categorizationSource: "ai",
        categoryDecisionProvider: JEV_DECISION_PROVIDER,
      }),
    ).toBe(JEV_DECISION_PROVIDER);
  });

  it("returns null for an old AI row with no stored provider", () => {
    expect(
      deriveCategorizationProvider({
        categorizationSource: "ai",
        categoryDecisionProvider: null,
      }),
    ).toBeNull();
  });

  it("ignores a stale provider once a rule/user/local/proto source took over", () => {
    for (const categorizationSource of [
      "rule",
      "user",
      "local",
      "proto",
    ] as const) {
      expect(
        deriveCategorizationProvider({
          categorizationSource,
          categoryDecisionProvider: LLMProvider.GEMINI,
        }),
      ).toBeNull();
    }
  });

  it("drops unknown provider values", () => {
    expect(
      deriveCategorizationProvider({
        categorizationSource: "ai",
        categoryDecisionProvider: "mystery-llm",
      }),
    ).toBeNull();
  });
});

describe("derivePriorityProvider", () => {
  it("returns the stored provider for an LLM-scored priority", () => {
    expect(
      derivePriorityProvider({
        prioritySource: PRIORITY_SCORE_SOURCE.LLM,
        priorityDecisionProvider: LLMProvider.BEDROCK,
      }),
    ).toBe(LLMProvider.BEDROCK);
  });

  it("returns null for rule- and local-scored priorities", () => {
    for (const prioritySource of [
      PRIORITY_SCORE_SOURCE.RULE,
      PRIORITY_SCORE_SOURCE.LOCAL,
    ]) {
      expect(
        derivePriorityProvider({
          prioritySource,
          priorityDecisionProvider: LLMProvider.OPENAI,
        }),
      ).toBeNull();
    }
  });
});

describe("toPriorityScoreSource", () => {
  it("keeps known values and drops anything else", () => {
    expect(toPriorityScoreSource(PRIORITY_SCORE_SOURCE.LOCAL)).toBe(
      PRIORITY_SCORE_SOURCE.LOCAL,
    );
    expect(toPriorityScoreSource("nonsense")).toBeNull();
    expect(toPriorityScoreSource(null)).toBeNull();
  });
});
