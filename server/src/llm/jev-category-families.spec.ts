import { JEV, JEV_TWO_STAGE } from "../constants/jev.constants";
import {
  buildFamilyOptions,
  buildJevFamilyRequest,
  familyOptionsShrinkChoice,
} from "./jev-category-families";

const CATEGORIES = [
  { name: "🔧 GitHub PR Updates", description: "Human PR notifications" },
  { name: "Newsletters", description: "Digests" },
  { name: "PRs from humans", description: "Not bots" },
  { name: "Unplaceable thing", description: "Nothing the taxonomy knows" },
];

describe("buildFamilyOptions", () => {
  it("groups by taxonomy family in first-member order and keeps unfamilied categories as their own option", () => {
    expect(buildFamilyOptions(CATEGORIES)).toEqual([
      { family: "GitHub / Pull Requests", categoryIndexes: [0, 2] },
      { family: "Newsletters & Marketing", categoryIndexes: [1] },
      { family: null, categoryIndexes: [3] },
    ]);
  });

  it("reports whether grouping removed any options", () => {
    const options = buildFamilyOptions(CATEGORIES);
    expect(familyOptionsShrinkChoice(options, CATEGORIES.length)).toBe(true);
    const single = buildFamilyOptions([CATEGORIES[1]]);
    expect(familyOptionsShrinkChoice(single, 1)).toBe(false);
  });
});

describe("buildJevFamilyRequest", () => {
  const params = { subject: "s", summary: "x", categories: CATEGORIES };

  it("lists a family's members by name only and a lone category with its description, plus Other", () => {
    const request = buildJevFamilyRequest(
      params,
      buildFamilyOptions(CATEGORIES),
      JEV.DEFAULT_MODEL,
    );
    const question = request.questions[JEV_TWO_STAGE.FAMILY_QUESTION_ID];
    expect(question.criteria).toEqual({
      "1": "GitHub / Pull Requests family — contains: 🔧 GitHub PR Updates; PRs from humans",
      "2": "Newsletters — Digests",
      "3": "Unplaceable thing — Nothing the taxonomy knows",
      [JEV.OTHER_OPTION]: expect.stringContaining("Other"),
    });
    expect(question.instructions).toContain("FAMILY");
  });

  it("rejects an empty option list", () => {
    expect(() =>
      buildJevFamilyRequest(params, [], JEV.DEFAULT_MODEL),
    ).toThrow();
  });
});
