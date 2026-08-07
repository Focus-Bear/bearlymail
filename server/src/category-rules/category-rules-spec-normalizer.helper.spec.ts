import { BadRequestException } from "@nestjs/common";

import { normalizeCompositeSpec } from "./category-rules-spec-normalizer.helper";
import { CreateCompositeCategoryRuleDto } from "./dto/create-composite-category-rule.dto";

const normalise = (raw: string): string => {
  const match = raw.match(/<([^>]+)>/) || raw.match(/([^\s]+@[^\s]+)/);
  return (match ? match[1] : raw).toLowerCase().trim();
};

describe("normalizeCompositeSpec", () => {
  it("allows a STRUCTURAL rule with no subject/body phrases (sender + notificationSubtype)", () => {
    const dto = {
      categoryName: "GitHub PRs",
      senderMatchesAny: ["*@github.com"],
      subjectContainsAny: [],
      bodyContainsAny: [],
      notificationSubtype: "github:pr",
    } as CreateCompositeCategoryRuleDto;

    const spec = normalizeCompositeSpec(dto, normalise);

    expect(spec.v).toBe(3);
    expect(spec.fromMatchesAny).toEqual(["*@github.com"]);
    expect(spec.subjectContainsAny).toEqual([]);
    expect(spec.bodyContainsAny).toEqual([]);
    expect(spec.notificationSubtype).toBe("github:pr");
  });

  it("still rejects a NON-structural rule that has no subject phrase", () => {
    const dto = {
      categoryName: "Newsletters",
      senderMatchesAny: ["news@acme.com"],
      subjectContainsAny: [],
      bodyContainsAny: ["unsubscribe"],
    } as CreateCompositeCategoryRuleDto;

    expect(() => normalizeCompositeSpec(dto, normalise)).toThrow(
      BadRequestException,
    );
  });

  it("still rejects a NON-structural rule that has no body phrase", () => {
    const dto = {
      categoryName: "Newsletters",
      senderMatchesAny: ["news@acme.com"],
      subjectContainsAny: ["Weekly"],
      bodyContainsAny: [],
    } as CreateCompositeCategoryRuleDto;

    expect(() => normalizeCompositeSpec(dto, normalise)).toThrow(
      BadRequestException,
    );
  });

  it("keeps building a full phrase-only rule when all three fields are present", () => {
    const dto = {
      categoryName: "CI",
      senderMatchesAny: ["alerts@acme.com"],
      subjectContainsAny: ["Build failed"],
      bodyContainsAny: ["pipeline"],
    } as CreateCompositeCategoryRuleDto;

    const spec = normalizeCompositeSpec(dto, normalise);

    expect(spec.subjectContainsAny).toEqual(["Build failed"]);
    expect(spec.bodyContainsAny).toEqual(["pipeline"]);
    expect(spec.notificationSubtype).toBeUndefined();
  });
});
