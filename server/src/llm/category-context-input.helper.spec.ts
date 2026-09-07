import { ContextKey } from "../database/entities/user-context.entity";
import {
  buildEmailCategoryInputs,
  buildProtoCategoryInputs,
} from "./category-context-input.helper";

describe("buildEmailCategoryInputs", () => {
  it("keeps only EMAIL_CATEGORY contexts and splits name / description / key", () => {
    expect(
      buildEmailCategoryInputs([
        {
          contextKey: ContextKey.EMAIL_CATEGORY,
          contextValue: "QA failed - Issues that failed QA",
          categoryKey: "qa_failed",
        },
        {
          contextKey: ContextKey.EMAIL_CATEGORY,
          contextValue: "Plain name",
          categoryKey: null,
        },
        { contextKey: ContextKey.URGENT, contextValue: "outages" },
      ]),
    ).toEqual([
      {
        name: "QA failed",
        description: "Issues that failed QA",
        categoryKey: "qa_failed",
      },
      { name: "Plain name", description: undefined, categoryKey: undefined },
    ]);
  });
});

describe("buildProtoCategoryInputs", () => {
  it("maps proto categories to candidates with a synthetic stable key", () => {
    expect(
      buildProtoCategoryInputs([
        {
          id: "11111111-2222-3333-4444-555555555555",
          name: "Release notes",
          description: null,
        },
      ]),
    ).toEqual([
      {
        name: "Release notes",
        description: undefined,
        categoryKey: "p_11111111222233334444555555555555",
      },
    ]);
  });
});
