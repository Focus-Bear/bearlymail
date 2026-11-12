import { OTHER_FAMILY } from "../context/category-family.taxonomy";
import { topFamilyConfidence } from "./jev-family-confidence";

const CATEGORIES: Record<string, string> = {
  "0": "Other",
  "1": "QA passed",
  "2": "QA failed",
  "3": "Invoices",
};
const nameFor = (choice: string) => CATEGORIES[choice] ?? null;

describe("topFamilyConfidence", () => {
  it("sums sibling probabilities, so a split between siblings still yields a confident family", () => {
    expect(
      topFamilyConfidence(
        { "0": 0.02, "1": 0.5, "2": 0.45, "3": 0.03 },
        nameFor,
      ),
    ).toEqual({
      family: "GitHub / Issues",
      confidence: expect.closeTo(0.95, 6),
    });
  });

  it("puts Other in the Other family", () => {
    expect(topFamilyConfidence({ "0": 0.9, "1": 0.1 }, nameFor)).toEqual({
      family: OTHER_FAMILY,
      confidence: 0.9,
    });
  });

  it("ignores choices outside the list", () => {
    expect(topFamilyConfidence({ "9": 0.8, "1": 0.2 }, nameFor)).toEqual({
      family: "GitHub / Issues",
      confidence: 0.2,
    });
  });

  it("is null without probabilities", () => {
    expect(topFamilyConfidence({}, nameFor)).toBeNull();
  });
});
