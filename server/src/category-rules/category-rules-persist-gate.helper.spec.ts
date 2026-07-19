import { Repository } from "typeorm";

import {
  CategoryRule,
  CompositeCategoryRuleSpec,
} from "../database/entities/category-rule.entity";
import { Email } from "../database/entities/email.entity";
import { LLMCategoriesService } from "../llm/llm-categories.service";
import { evaluateRulePersistGate } from "./category-rules-persist-gate.helper";

const normaliseSender = (raw: string) => raw.toLowerCase().trim();

const candidateSpec: CompositeCategoryRuleSpec = {
  v: 3,
  fromMatchesAny: ["*@github.com"],
  subjectContainsAny: ["PR #"],
  bodyContainsAny: ["pull request"],
};

const matchingEmail = {
  from: "notifications@github.com",
  subject: "PR #42 merged",
  body: "Your pull request was merged.",
};

const CATEGORY_ID = "cat-github-prs";

const siblingRule = {
  categoryName: "GitHub PRs",
  categoryId: CATEGORY_ID,
  ruleKind: "composite",
  compositeSpec: {
    v: 2,
    senderMatchesAny: ["*@github.com"],
    subjectContainsAny: ["Issue #"],
    bodyContainsAny: ["opened an issue"],
  },
};

interface Mocks {
  emailRepository: Pick<Repository<Email>, "find">;
  categoryRuleRepository: Pick<Repository<CategoryRule>, "find">;
  llmCategoriesService: Pick<LLMCategoriesService, "assessRuleAddsValue">;
}

const makeMocks = (opts: {
  emails: unknown[];
  siblings: unknown[];
  assess?: {
    addsValue: boolean;
    reasoning: string;
    subjectNotContainsAny: string[];
    bodyNotContainsAny: string[];
  };
}): Mocks => ({
  emailRepository: { find: jest.fn().mockResolvedValue(opts.emails) } as never,
  categoryRuleRepository: {
    find: jest.fn().mockResolvedValue(opts.siblings),
  } as never,
  llmCategoriesService: {
    assessRuleAddsValue: jest.fn().mockResolvedValue(
      opts.assess ?? {
        addsValue: true,
        reasoning: "",
        subjectNotContainsAny: [],
        bodyNotContainsAny: [],
      },
    ),
  } as never,
});

const baseParams = (mocks: Mocks) => ({
  ...mocks,
  normaliseSender,
  userId: "user-1",
  categoryName: "GitHub PRs",
  categoryId: CATEGORY_ID,
  candidateSpec,
});

describe("evaluateRulePersistGate", () => {
  it("rejects a rule that matches no mailbox email", async () => {
    const mocks = makeMocks({ emails: [], siblings: [] });
    const outcome = await evaluateRulePersistGate(baseParams(mocks));
    expect(outcome.shouldPersist).toBe(false);
    expect(outcome.reason).toBe("no_mailbox_match");
    expect(
      mocks.llmCategoriesService.assessRuleAddsValue,
    ).not.toHaveBeenCalled();
  });

  it("rejects a matching rule that ends up with no exclusion", async () => {
    // No siblings → value-add not run → no exclusions added.
    const mocks = makeMocks({ emails: [matchingEmail], siblings: [] });
    const outcome = await evaluateRulePersistGate(baseParams(mocks));
    expect(outcome.shouldPersist).toBe(false);
    expect(outcome.reason).toBe("no_exclusions");
  });

  it("rejects a rule the value-add step deems redundant", async () => {
    const mocks = makeMocks({
      emails: [matchingEmail],
      siblings: [siblingRule],
      assess: {
        addsValue: false,
        reasoning: "covered by an existing rule",
        subjectNotContainsAny: [],
        bodyNotContainsAny: [],
      },
    });
    const outcome = await evaluateRulePersistGate(baseParams(mocks));
    expect(outcome.shouldPersist).toBe(false);
    expect(outcome.reason).toBe("redundant");
  });

  it("persists a rule that adds value and gets a disambiguating exclusion", async () => {
    const mocks = makeMocks({
      emails: [matchingEmail],
      siblings: [siblingRule],
      assess: {
        addsValue: true,
        reasoning: "distinct from the issue rule",
        subjectNotContainsAny: ["Issue #"],
        bodyNotContainsAny: [],
      },
    });
    const outcome = await evaluateRulePersistGate(baseParams(mocks));
    expect(outcome.shouldPersist).toBe(true);
    expect(outcome.finalSpec).not.toBeNull();
    const v3 = outcome.finalSpec as Extract<
      CompositeCategoryRuleSpec,
      { v: 3 }
    >;
    expect(v3.subjectNotContainsAny).toEqual(["Issue #"]);
  });

  it("strips a value-add exclusion that duplicates the candidate's own body phrase", async () => {
    const mocks = makeMocks({
      emails: [matchingEmail],
      siblings: [siblingRule],
      assess: {
        addsValue: true,
        reasoning: "distinct, but also returned a contradictory phrase",
        subjectNotContainsAny: ["Issue #"],
        // "pull request" is also a positive body-contains phrase of the
        // candidate, so it must be dropped rather than persisted.
        bodyNotContainsAny: ["pull request"],
      },
    });
    const outcome = await evaluateRulePersistGate(baseParams(mocks));
    expect(outcome.shouldPersist).toBe(true);
    const v3 = outcome.finalSpec as Extract<
      CompositeCategoryRuleSpec,
      { v: 3 }
    >;
    expect(v3.subjectNotContainsAny).toEqual(["Issue #"]);
    expect(v3.bodyNotContainsAny).toBeUndefined();
  });

  it("rejects when the merged exclusion removes every match", async () => {
    const mocks = makeMocks({
      emails: [matchingEmail],
      siblings: [siblingRule],
      assess: {
        addsValue: true,
        reasoning: "adds value",
        // "merged" is present in the only matching email's subject.
        subjectNotContainsAny: ["merged"],
        bodyNotContainsAny: [],
      },
    });
    const outcome = await evaluateRulePersistGate(baseParams(mocks));
    expect(outcome.shouldPersist).toBe(false);
    expect(outcome.reason).toBe("exclusions_removed_all_matches");
  });

  it("allows a clean exclusion-free rule when requireExclusions is false", async () => {
    const mocks = makeMocks({ emails: [matchingEmail], siblings: [] });
    const outcome = await evaluateRulePersistGate({
      ...baseParams(mocks),
      requireExclusions: false,
    });
    expect(outcome.shouldPersist).toBe(true);
    expect(outcome.reason).toBe("ok");
  });

  it("skips value-add when skipValueAdd is set (manual creation path)", async () => {
    const mocks = makeMocks({
      emails: [matchingEmail],
      siblings: [siblingRule],
    });
    const outcome = await evaluateRulePersistGate({
      ...baseParams(mocks),
      skipValueAdd: true,
      requireExclusions: false,
    });
    expect(outcome.shouldPersist).toBe(true);
    expect(
      mocks.llmCategoriesService.assessRuleAddsValue,
    ).not.toHaveBeenCalled();
  });
});
