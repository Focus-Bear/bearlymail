import { WorkflowCondition } from "../types/workflow.types";
import { matchesWorkflowCondition } from "../workflow-condition-matcher";

const input = {
  from: "notifications@github.com",
  subject:
    "[Focus-Bear/Mac-App] Run failed: Check Translations - main (abc1234)",
  body: "Check Translations: Some jobs were not successful",
  category: "cat-1",
  priority: "low",
};

const condition = (
  overrides: Partial<WorkflowCondition>,
): WorkflowCondition => ({
  fromPatterns: [],
  subjectPatterns: [],
  ...overrides,
});

describe("matchesWorkflowCondition", () => {
  it("treats empty pattern lists as 'any'", () => {
    expect(matchesWorkflowCondition(condition({}), input)).toBe(true);
  });

  it("ANDs fields and ORs patterns within a field", () => {
    expect(
      matchesWorkflowCondition(
        condition({
          fromPatterns: ["*@github.com"],
          subjectPatterns: ["nope", "check translations"],
        }),
        input,
      ),
    ).toBe(true);
    expect(
      matchesWorkflowCondition(
        condition({
          fromPatterns: ["*@github.com"],
          subjectPatterns: ["nope"],
        }),
        input,
      ),
    ).toBe(false);
  });

  it("matches body patterns against the body", () => {
    expect(
      matchesWorkflowCondition(
        condition({ bodyPatterns: ["some jobs were not successful"] }),
        input,
      ),
    ).toBe(true);
    expect(
      matchesWorkflowCondition(
        condition({ bodyPatterns: ["requested your review"] }),
        input,
      ),
    ).toBe(false);
  });

  it("still honours category and priority filters", () => {
    expect(
      matchesWorkflowCondition(condition({ categories: ["cat-2"] }), input),
    ).toBe(false);
    expect(
      matchesWorkflowCondition(condition({ priorityLevels: ["low"] }), input),
    ).toBe(true);
  });
});
