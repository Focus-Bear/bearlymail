import { CATEGORY_RULE_COMPOSITE } from "../constants/category-rule-composite.constants";
import { CompositeCategoryRuleSpec } from "../database/entities/category-rule.entity";
import type { GithubCategorySignals } from "../github/github-category-signals.helper";
import {
  cleanGithubProjectStatuses,
  cleanGithubStates,
  describeGithubConditions,
  githubConditionCount,
  githubConditionFields,
  GithubRuleConditions,
  sameGithubConditions,
  specMatchesGithubConditions,
} from "./category-rules-github-conditions.helper";

const BASE_FACTS: GithubCategorySignals = {
  item: "issue",
  reference: { owner: "Focus-Bear", repo: "Mac-App", number: 812 },
  subtype: "github:issue:comment:human",
  event: "comment",
  actorKind: "human",
  actorLogin: "qa-tester",
  reason: null,
  state: "open",
  authorKind: "human",
  authorLogin: "jeremy",
  projectStatuses: [{ project: "Mac App roadmap", status: "QA passed" }],
  labels: ["bug"],
  reviewStatus: null,
  checksState: null,
  metadataFetchedAt: "2026-09-01T11:00:00.000Z",
  metadataStale: false,
};

function facts(
  overrides: Partial<GithubCategorySignals> = {},
): GithubCategorySignals {
  return { ...BASE_FACTS, ...overrides };
}

function spec(conditions: GithubRuleConditions): CompositeCategoryRuleSpec {
  return {
    v: CATEGORY_RULE_COMPOSITE.SPEC_VERSION,
    fromMatchesAny: ["notifications@github.com"],
    subjectContainsAny: [],
    bodyContainsAny: [],
    ...conditions,
  };
}

describe("specMatchesGithubConditions", () => {
  it("is satisfied by any email when the spec pins nothing", () => {
    expect(specMatchesGithubConditions(spec({}), null)).toBe(true);
  });

  it("is never satisfied by an email with no facts when the spec pins one", () => {
    expect(
      specMatchesGithubConditions(spec({ githubStateAny: ["merged"] }), null),
    ).toBe(false);
  });

  describe("githubStateAny", () => {
    it("matches when the item's state is in the list", () => {
      expect(
        specMatchesGithubConditions(
          spec({ githubStateAny: ["merged", "closed"] }),
          facts({ state: "merged" }),
        ),
      ).toBe(true);
    });

    it("does not match another state", () => {
      expect(
        specMatchesGithubConditions(
          spec({ githubStateAny: ["merged"] }),
          facts({ state: "open" }),
        ),
      ).toBe(false);
    });

    it("does not match when the state was never fetched", () => {
      expect(
        specMatchesGithubConditions(
          spec({ githubStateAny: ["merged"] }),
          facts({ state: null }),
        ),
      ).toBe(false);
    });
  });

  describe("githubProjectStatusAny", () => {
    it("matches a board status case-insensitively", () => {
      expect(
        specMatchesGithubConditions(
          spec({ githubProjectStatusAny: [{ status: "qa PASSED" }] }),
          facts(),
        ),
      ).toBe(true);
    });

    it("matches when scoped to the item's own project", () => {
      expect(
        specMatchesGithubConditions(
          spec({
            githubProjectStatusAny: [
              { status: "QA passed", project: "Mac App roadmap" },
            ],
          }),
          facts(),
        ),
      ).toBe(true);
    });

    it("does not match the same status on a different project", () => {
      expect(
        specMatchesGithubConditions(
          spec({
            githubProjectStatusAny: [
              { status: "QA passed", project: "Backend board" },
            ],
          }),
          facts(),
        ),
      ).toBe(false);
    });

    it("does not match a different status", () => {
      expect(
        specMatchesGithubConditions(
          spec({ githubProjectStatusAny: [{ status: "QA failed" }] }),
          facts(),
        ),
      ).toBe(false);
    });
  });

  describe("githubAuthorKind", () => {
    it("matches the PR/issue AUTHOR, not the acting account", () => {
      expect(
        specMatchesGithubConditions(
          spec({ githubAuthorKind: "bot" }),
          facts({ authorKind: "bot", actorKind: "human" }),
        ),
      ).toBe(true);
      expect(
        specMatchesGithubConditions(
          spec({ githubAuthorKind: "bot" }),
          facts({ authorKind: "human", actorKind: "bot" }),
        ),
      ).toBe(false);
    });
  });

  describe("githubLabelsAny", () => {
    it("matches any listed label, case-insensitively", () => {
      expect(
        specMatchesGithubConditions(
          spec({ githubLabelsAny: ["regression", "BUG"] }),
          facts(),
        ),
      ).toBe(true);
    });

    it("does not match when the item carries none of them", () => {
      expect(
        specMatchesGithubConditions(
          spec({ githubLabelsAny: ["regression"] }),
          facts(),
        ),
      ).toBe(false);
    });
  });

  it("ANDs multiple conditions together", () => {
    const pinned = spec({
      githubStateAny: ["merged"],
      githubAuthorKind: "bot",
    });

    expect(
      specMatchesGithubConditions(
        pinned,
        facts({ state: "merged", authorKind: "bot" }),
      ),
    ).toBe(true);
    expect(
      specMatchesGithubConditions(
        pinned,
        facts({ state: "merged", authorKind: "human" }),
      ),
    ).toBe(false);
  });

  it("ignores GitHub conditions carried by a legacy v2 spec", () => {
    const legacy = {
      v: CATEGORY_RULE_COMPOSITE.SPEC_VERSION_V2,
      senderMatchesAny: ["notifications@github.com"],
      subjectContainsAny: [],
      bodyContainsAny: [],
      githubStateAny: ["merged"],
    } as unknown as CompositeCategoryRuleSpec;

    expect(specMatchesGithubConditions(legacy, null)).toBe(true);
  });
});

describe("condition cleaning", () => {
  it("drops unknown states and de-duplicates case-insensitively", () => {
    expect(cleanGithubStates(["MERGED", "merged", "draft", ""])).toEqual([
      "merged",
    ]);
  });

  it("drops empty statuses and de-duplicates per project scope", () => {
    expect(
      cleanGithubProjectStatuses([
        { status: " QA passed " },
        { status: "qa passed" },
        { status: "QA passed", project: "Mac App roadmap" },
        { status: "  " },
        null,
      ]),
    ).toEqual([
      { status: "QA passed" },
      { status: "QA passed", project: "Mac App roadmap" },
    ]);
  });

  it("emits only populated fields so an unpinned spec carries no empty arrays", () => {
    expect(
      githubConditionFields({ githubStateAny: [], githubLabelsAny: ["bug"] }),
    ).toEqual({ githubLabelsAny: ["bug"] });
  });
});

describe("condition summaries", () => {
  it("counts each pinned condition once", () => {
    expect(
      githubConditionCount(
        spec({ githubStateAny: ["merged"], githubLabelsAny: ["bug"] }),
      ),
    ).toBe(2);
    expect(githubConditionCount(spec({}))).toBe(0);
  });

  it("describes the pins for the LLM summaries", () => {
    expect(
      describeGithubConditions(
        spec({
          githubStateAny: ["merged"],
          githubProjectStatusAny: [
            { status: "QA passed", project: "Mac App roadmap" },
          ],
          githubAuthorKind: "bot",
        }),
      ),
    ).toEqual([
      "state is one of: merged",
      "project board status is one of: Mac App roadmap / QA passed",
      "PR/issue author is a bot",
    ]);
  });

  it("treats differently-pinned specs as different rules", () => {
    expect(
      sameGithubConditions(
        spec({ githubStateAny: ["merged"] }),
        spec({ githubStateAny: ["merged"] }),
      ),
    ).toBe(true);
    expect(
      sameGithubConditions(
        spec({ githubStateAny: ["merged"] }),
        spec({ githubStateAny: ["closed"] }),
      ),
    ).toBe(false);
  });
});
