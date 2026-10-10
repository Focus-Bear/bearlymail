import { BadRequestException } from "@nestjs/common";

import { CATEGORY_RULE_COMPOSITE } from "../constants/category-rule-composite.constants";
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

describe("normalizeCompositeSpec — notification subtype sets", () => {
  const normalise = (raw: string) => raw.trim().toLowerCase();

  it("canonicalises a set of subtypes into notificationSubtypeAny (deduped, trimmed)", () => {
    const spec = normalizeCompositeSpec(
      {
        categoryName: "Human PR updates",
        senderMatchesAny: ["notifications@github.com"],
        subjectContainsAny: [],
        bodyContainsAny: [],
        notificationSubtypeAny: [
          " github:pr:comment:human",
          "github:pr:push:human",
          "GITHUB:pr:push:human",
        ],
      } as never,
      normalise,
    );
    expect(spec.notificationSubtypeAny).toEqual([
      "github:pr:comment:human",
      "github:pr:push:human",
    ]);
    expect(spec.notificationSubtype).toBeUndefined();
  });

  it("folds the single field and the set together, and stores a lone subtype in the single field", () => {
    const spec = normalizeCompositeSpec(
      {
        categoryName: "PR merged",
        senderMatchesAny: ["notifications@github.com"],
        subjectContainsAny: [],
        bodyContainsAny: [],
        notificationSubtype: "github:pr:merged:human",
        notificationSubtypeAny: ["github:pr:merged:human"],
      } as never,
      normalise,
    );
    expect(spec.notificationSubtype).toBe("github:pr:merged:human");
    expect(spec.notificationSubtypeAny).toBeUndefined();
  });

  it("rejects more than MAX_NOTIFICATION_SUBTYPES pinned subtypes", () => {
    const tooMany = Array.from(
      { length: CATEGORY_RULE_COMPOSITE.MAX_NOTIFICATION_SUBTYPES + 1 },
      (_, index) => `github:pr:event${index}:bot`,
    );
    expect(() =>
      normalizeCompositeSpec(
        {
          categoryName: "Bots",
          senderMatchesAny: ["notifications@github.com"],
          subjectContainsAny: [],
          bodyContainsAny: [],
          notificationSubtypeAny: tooMany,
        } as never,
        normalise,
      ),
    ).toThrow(BadRequestException);
  });
});
