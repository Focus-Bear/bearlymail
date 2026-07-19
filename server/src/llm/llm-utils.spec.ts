import { supportsReasoningEffort } from "./llm-utils";

describe("supportsReasoningEffort", () => {
  it.each(["o1", "o3", "o1-mini", "o3-mini", "gpt-5", "gpt-5.4-mini", "gpt-6"])(
    "returns true for reasoning model %s",
    (model) => {
      expect(supportsReasoningEffort(model)).toBe(true);
    },
  );

  it.each(["gpt-4o", "gpt-4o-mini", "gpt-4", "gpt-3.5-turbo", "o2"])(
    "returns false for non-reasoning model %s",
    (model) => {
      expect(supportsReasoningEffort(model)).toBe(false);
    },
  );
});
