import {
  CompositeCategoryRuleSpec,
  CompositeCategoryRuleSpecV3,
} from "../database/entities/category-rule.entity";
import {
  cleanNotificationSubtypes,
  isGithubNotificationSubtype,
  notificationSubtypeDepthOf,
  notificationSubtypeFields,
  notificationSubtypesOf,
  sameNotificationSubtypes,
  specHasGithubNotificationSubtype,
  specHasNotificationSubtype,
  specMatchesNotificationSubtype,
} from "./category-rules-notification-subtype.helper";

const base: CompositeCategoryRuleSpecV3 = {
  v: 3,
  fromMatchesAny: ["notifications@github.com"],
  subjectContainsAny: [],
  bodyContainsAny: [],
};

const HUMAN_PR_UPDATES = [
  "github:pr:comment:human",
  "github:pr:push:human",
  "github:pr:review_approved:human",
];

describe("notificationSubtypesOf", () => {
  it("returns the union of the single field and the set, de-duplicated", () => {
    expect(
      notificationSubtypesOf({
        ...base,
        notificationSubtype: "github:pr:push:human",
        notificationSubtypeAny: [
          "github:pr:comment:human",
          " GITHUB:pr:push:human ",
        ],
      }),
    ).toEqual(["github:pr:push:human", "github:pr:comment:human"]);
  });

  it("is empty for unpinned v3 specs and for v1/v2 specs", () => {
    expect(notificationSubtypesOf(base)).toEqual([]);
    const v2: CompositeCategoryRuleSpec = {
      v: 2,
      senderMatchesAny: ["a@b.c"],
      subjectContainsAny: ["x"],
      bodyContainsAny: ["y"],
    };
    expect(notificationSubtypesOf(v2)).toEqual([]);
    expect(specHasNotificationSubtype(v2)).toBe(false);
  });
});

describe("specMatchesNotificationSubtype", () => {
  it("is always satisfied by an unpinned spec", () => {
    expect(specMatchesNotificationSubtype(base, undefined)).toBe(true);
    expect(specMatchesNotificationSubtype(base, "github:pr:merged:human")).toBe(
      true,
    );
  });

  it("matches a set when the email subtype equals or refines any member", () => {
    const spec = { ...base, notificationSubtypeAny: HUMAN_PR_UPDATES };
    expect(specMatchesNotificationSubtype(spec, "github:pr:push:human")).toBe(
      true,
    );
    expect(specMatchesNotificationSubtype(spec, "github:pr:push:bot")).toBe(
      false,
    );
    expect(specMatchesNotificationSubtype(spec, "github:pr:merged:human")).toBe(
      false,
    );
    expect(specMatchesNotificationSubtype(spec, undefined)).toBe(false);
  });

  it("lets a legacy coarse single pin match today's fine subtypes", () => {
    const legacy = { ...base, notificationSubtype: "github:pr" };
    expect(
      specMatchesNotificationSubtype(legacy, "github:pr:comment:bot"),
    ).toBe(true);
    expect(
      specMatchesNotificationSubtype(legacy, "github:issue:comment:bot"),
    ).toBe(false);
  });
});

describe("specificity depth, GitHub detection, set equality", () => {
  it("uses the shallowest pinned member as the depth", () => {
    expect(notificationSubtypeDepthOf(base)).toBe(0);
    expect(
      notificationSubtypeDepthOf({ ...base, notificationSubtype: "github:pr" }),
    ).toBe(2);
    expect(
      notificationSubtypeDepthOf({
        ...base,
        notificationSubtypeAny: ["github:pr:merged:human", "github:pr"],
      }),
    ).toBe(2);
    expect(
      notificationSubtypeDepthOf({
        ...base,
        notificationSubtypeAny: HUMAN_PR_UPDATES,
      }),
    ).toBe(4);
  });

  it("recognises GitHub sub-streams", () => {
    expect(isGithubNotificationSubtype("github:pr:comment:bot")).toBe(true);
    expect(isGithubNotificationSubtype("atlassian:tag:proj-#")).toBe(false);
    expect(isGithubNotificationSubtype(undefined)).toBe(false);
    expect(
      specHasGithubNotificationSubtype({
        ...base,
        notificationSubtypeAny: HUMAN_PR_UPDATES,
      }),
    ).toBe(true);
    expect(
      specHasGithubNotificationSubtype({
        ...base,
        notificationSubtype: "tag:alert",
      }),
    ).toBe(false);
  });

  it("compares pinned sets order- and case-insensitively across both fields", () => {
    const asSet = {
      ...base,
      notificationSubtypeAny: [
        "github:pr:push:human",
        "github:pr:comment:human",
      ],
    };
    const asSingleAndSet = {
      ...base,
      notificationSubtype: "GitHub:PR:comment:human",
      notificationSubtypeAny: ["github:pr:push:human"],
    };
    expect(sameNotificationSubtypes(asSet, asSingleAndSet)).toBe(true);
    expect(
      sameNotificationSubtypes(asSet, {
        ...base,
        notificationSubtype: "github:pr",
      }),
    ).toBe(false);
    expect(sameNotificationSubtypes(base, base)).toBe(true);
  });
});

describe("cleanNotificationSubtypes / notificationSubtypeFields", () => {
  it("trims, drops empties and de-duplicates case-insensitively", () => {
    expect(
      cleanNotificationSubtypes([
        " github:pr ",
        "",
        undefined,
        null,
        "GITHUB:PR",
        "github:issue",
      ]),
    ).toEqual(["github:pr", "github:issue"]);
  });

  it("canonicalises one subtype to the single field and several to the set", () => {
    expect(notificationSubtypeFields([])).toEqual({});
    expect(notificationSubtypeFields(["github:pr:merged:human"])).toEqual({
      notificationSubtype: "github:pr:merged:human",
    });
    expect(notificationSubtypeFields(HUMAN_PR_UPDATES)).toEqual({
      notificationSubtypeAny: HUMAN_PR_UPDATES,
    });
  });
});
