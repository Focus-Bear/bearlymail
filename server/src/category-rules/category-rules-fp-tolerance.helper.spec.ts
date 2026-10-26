import { countDisqualifyingFalsePositives } from "./category-rules-fp-tolerance.helper";

const TARGET = "cat-pr-merged";
const SIBLING = "cat-pr-updates";
const OTHER_FAMILY_CATEGORY = "cat-ci-failures";
const UNFAMILIED = "cat-unfamilied";
const FAMILIES = new Map<string, string | null>([
  [TARGET, "family-pull-requests"],
  [SIBLING, "family-pull-requests"],
  [OTHER_FAMILY_CATEGORY, "family-ci"],
  [UNFAMILIED, null],
]);

const count = (
  falsePositiveCategoryIds: Array<string | null>,
  truePositives: number,
  overrides: {
    targetCategoryId?: string | null;
    families?: typeof FAMILIES;
  } = {},
) =>
  countDisqualifyingFalsePositives({
    falsePositiveCategoryIds,
    truePositives,
    targetCategoryId:
      overrides.targetCategoryId === undefined
        ? TARGET
        : overrides.targetCategoryId,
    familyIdByCategoryId:
      "families" in overrides ? overrides.families : FAMILIES,
  });

describe("countDisqualifyingFalsePositives", () => {
  it("tolerates same-family false positives up to 6% of matches", () => {
    // 3 of 50 matches = 6%.
    expect(count([SIBLING, SIBLING, SIBLING], 47)).toBe(0);
  });

  it("counts every false positive once same-family ones exceed 6%", () => {
    // 2 of 18 matches ≈ 11%.
    expect(count([SIBLING, SIBLING], 16)).toBe(2);
  });

  it("never tolerates a false positive in another family", () => {
    expect(count([SIBLING, OTHER_FAMILY_CATEGORY], 100)).toBe(2);
  });

  it("never tolerates an uncategorised or unfamilied false positive", () => {
    expect(count([null], 100)).toBe(1);
    expect(count([UNFAMILIED], 100)).toBe(1);
  });

  it("is strict when the target category has no family", () => {
    expect(count([SIBLING], 100, { targetCategoryId: UNFAMILIED })).toBe(1);
  });

  it("is strict without family data", () => {
    expect(count([SIBLING], 100, { families: undefined })).toBe(1);
  });

  it("is zero when there are no false positives", () => {
    expect(count([], 5)).toBe(0);
  });
});
