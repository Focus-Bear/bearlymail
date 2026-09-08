import { Logger } from "@nestjs/common";

import { CATEGORY_RULE_COMPOSITE } from "../constants/category-rule-composite.constants";
import type { EmailMetadata } from "./category-rules.types";
import {
  buildDraftCompositeSpec,
  DraftCompositeSpecDeps,
} from "./category-rules-draft.helper";
import { normalizeCompositeSpec } from "./category-rules-spec-normalizer.helper";
import type { ValidationRow } from "./category-rules-validate.helper";

jest.mock("../encryption/encryption.helper", () => {
  const noopTransformer = {
    to: (value: unknown) => value,
    from: (value: unknown) => value,
  };
  return {
    EncryptionHelper: {
      decrypt: (value: string) => value,
    },
    makeEmailTransformer: () => noopTransformer,
    makeEncryptedColumnTransformer: () => noopTransformer,
    makeEncryptedJsonTransformer: () => noopTransformer,
    makeGlobalEmailTransformer: () => noopTransformer,
    makeGlobalEncryptedColumnTransformer: () => noopTransformer,
    makeGlobalEncryptedJsonTransformer: () => noopTransformer,
  };
});

const USER_ID = "user-1";
const CATEGORY = "🤖 GitHub Bot PR Updates";
const TARGET = "cat-bot-pr";
const OTHER = "cat-human-pr";
const PR_URL = "https://github.com/owner/repo/pull/430";
const BOT = '"dependabot[bot]" <notifications@github.com>';
const HUMAN = "octocat <notifications@github.com>";

const normalise = (raw: string): string => {
  const match = raw.match(/<([^>]+)>/) || raw.match(/([^\s]+@[^\s]+)/);
  return (match ? match[1] : raw).toLowerCase().trim();
};

function row(from: string, opener: string, categoryId: string): ValidationRow {
  return {
    from,
    subject: "Re: [owner/repo] Bump ws (PR #430)",
    body: `${opener}\n\n-- \nReply to this email directly or view it on GitHub:\n${PR_URL}\nYou are receiving this because you are subscribed to this thread.`,
    htmlBody: null,
    categoryId,
  };
}

const botComment = (categoryId: string) =>
  row(BOT, "@dependabot[bot] left a comment (owner/repo#430)", categoryId);
const botPush = (categoryId: string) =>
  row(BOT, "@dependabot[bot] pushed 1 commit.", categoryId);
const humanComment = (categoryId: string) =>
  row(HUMAN, "@octocat left a comment (owner/repo#430)", categoryId);

const seedEmail: EmailMetadata = {
  from: BOT,
  subject: "Re: [owner/repo] Bump ws (PR #430)",
  bodyTextForMatch:
    "@dependabot[bot] left a comment (owner/repo#430) Superseded.",
  notificationSubtype: "github:pr:comment:bot",
};

const llmPhrases = {
  fromMatchesAny: ["notifications@github.com"],
  subjectContainsAny: ["Bump"],
  bodyContainsAny: ["Superseded"],
  subjectNotContainsAny: [],
  bodyNotContainsAny: [],
};

interface Windows {
  categoryRows: ValidationRow[];
  broadRows: ValidationRow[];
}

function buildDeps(windows: Windows) {
  const suggestRulesFromEmailSamples = jest.fn().mockResolvedValue(llmPhrases);
  const deriveExclusionPhrasesFromFalsePositives = jest
    .fn()
    .mockResolvedValue({ subjectNotContainsAny: [], bodyNotContainsAny: [] });
  // The broad (FP) window query has 2 params; the category (TP) window has 3.
  const query = jest
    .fn()
    .mockImplementation((_sql: string, params: unknown[]) =>
      Promise.resolve(
        params.length === 3 ? windows.categoryRows : windows.broadRows,
      ),
    );
  const deps: DraftCompositeSpecDeps = {
    emailRepository: { find: jest.fn().mockResolvedValue([]) } as never,
    emailThreadRepository: { manager: { query } } as never,
    llmCategoriesService: {
      suggestRulesFromEmailSamples,
      deriveExclusionPhrasesFromFalsePositives,
    } as never,
    logger: { log: jest.fn(), warn: jest.fn() } as unknown as Logger,
    normaliseSender: normalise,
    countDistinctThreadsForSender: jest.fn().mockResolvedValue(50),
    hasExhaustedAutoGenerationBudget: jest.fn().mockResolvedValue(false),
    normalizeCompositeSpecDto: (dto) => normalizeCompositeSpec(dto, normalise),
    findCategoryId: jest.fn().mockResolvedValue(TARGET),
  };
  return { deps, suggestRulesFromEmailSamples, query };
}

const autoOptions = {
  enforceThreadCountGate: true,
  requireDerivedExclusions: true,
  preferStructuralSubtypeSet: true,
};

describe("buildDraftCompositeSpec — structural-first path for GitHub seeds", () => {
  it("pins the clean sub-stream set from the category's own mail, with no phrases and no LLM call", async () => {
    const { deps, suggestRulesFromEmailSamples } = buildDeps({
      categoryRows: [botComment(TARGET), botComment(TARGET), botPush(TARGET)],
      broadRows: [humanComment(OTHER), humanComment(OTHER)],
    });

    const draft = await buildDraftCompositeSpec(
      deps,
      USER_ID,
      seedEmail,
      CATEGORY,
      autoOptions,
    );

    expect(draft?.spec).toEqual(
      expect.objectContaining({
        v: 3,
        fromMatchesAny: ["notifications@github.com"],
        subjectContainsAny: [],
        bodyContainsAny: [],
        notificationSubtypeAny: ["github:pr:comment:bot", "github:pr:push:bot"],
        bodyNotContainsAny: expect.arrayContaining([
          ...CATEGORY_RULE_COMPOSITE.QA_TEMPLATE_MARKERS,
        ]),
      }),
    );
    expect(draft?.subtypeBreakdown).toEqual([
      { subtype: "github:pr:comment:bot", truePositives: 2, falsePositives: 0 },
      { subtype: "github:pr:push:bot", truePositives: 1, falsePositives: 0 },
      {
        subtype: "github:pr:comment:human",
        truePositives: 0,
        falsePositives: 2,
      },
    ]);
    expect(draft?.exclusionsDerived).toBe(true);
    expect(suggestRulesFromEmailSamples).not.toHaveBeenCalled();
  });

  it("stores a lone clean sub-stream in the single notificationSubtype field", async () => {
    const { deps } = buildDeps({
      categoryRows: [botComment(TARGET)],
      broadRows: [humanComment(OTHER)],
    });

    const draft = await buildDraftCompositeSpec(
      deps,
      USER_ID,
      seedEmail,
      CATEGORY,
      autoOptions,
    );

    expect(draft?.spec).toEqual(
      expect.objectContaining({ notificationSubtype: "github:pr:comment:bot" }),
    );
    expect(draft?.spec).not.toHaveProperty("notificationSubtypeAny");
  });

  it("falls back to phrase drafting (LLM, seed subtype pinned) when no sub-stream is clean, keeping the breakdown", async () => {
    // The seed's own sub-stream has false positives, and nothing else is clean —
    // but the LLM phrases ("Superseded") still separate the two bot comments.
    const { deps, suggestRulesFromEmailSamples } = buildDeps({
      categoryRows: [
        row(
          BOT,
          "@dependabot[bot] left a comment (owner/repo#430) Superseded by #431.",
          TARGET,
        ),
      ],
      broadRows: [
        row(
          BOT,
          "@dependabot[bot] left a comment (owner/repo#430) Looks good.",
          OTHER,
        ),
      ],
    });

    const draft = await buildDraftCompositeSpec(
      deps,
      USER_ID,
      seedEmail,
      CATEGORY,
      autoOptions,
    );

    expect(suggestRulesFromEmailSamples).toHaveBeenCalledWith(
      CATEGORY,
      ["notifications@github.com"],
      expect.any(Array),
      USER_ID,
      "github:pr:comment:bot",
    );
    expect(draft?.spec).toEqual(
      expect.objectContaining({
        bodyContainsAny: ["Superseded"],
        notificationSubtype: "github:pr:comment:bot",
      }),
    );
    expect(draft?.subtypeBreakdown).toEqual([
      { subtype: "github:pr:comment:bot", truePositives: 1, falsePositives: 1 },
    ]);
  });

  it("fetches the validation windows once and reuses them for the phrase fallback", async () => {
    const { deps, query } = buildDeps({
      categoryRows: [botComment(TARGET)],
      broadRows: [botComment(OTHER)],
    });

    await buildDraftCompositeSpec(
      deps,
      USER_ID,
      seedEmail,
      CATEGORY,
      autoOptions,
    );

    // One broad + one category query, shared by both draft paths.
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("skips the structural path for user drafts (phrases only round-trip to the review UI)", async () => {
    const { deps, suggestRulesFromEmailSamples } = buildDeps({
      categoryRows: [botComment(TARGET), botPush(TARGET)],
      broadRows: [],
    });

    const draft = await buildDraftCompositeSpec(
      deps,
      USER_ID,
      seedEmail,
      CATEGORY,
      {
        enforceThreadCountGate: false,
        requireDerivedExclusions: false,
        allowLlmSuggestedExclusions: true,
      },
    );

    expect(suggestRulesFromEmailSamples).toHaveBeenCalled();
    expect(draft?.spec).toEqual(
      expect.objectContaining({
        subjectContainsAny: ["Bump"],
        notificationSubtype: "github:pr:comment:bot",
      }),
    );
    expect(draft?.subtypeBreakdown).toBeUndefined();
  });

  it("skips the structural path for non-GitHub seeds", async () => {
    const { deps, suggestRulesFromEmailSamples } = buildDeps({
      categoryRows: [],
      broadRows: [],
    });
    const sentryEmail: EmailMetadata = {
      from: "noreply@sentry.io",
      subject: "[Sentry] New issue",
      bodyTextForMatch: "TypeError in checkout",
      notificationSubtype: "sentry:tag:sentry",
    };

    await buildDraftCompositeSpec(
      deps,
      USER_ID,
      sentryEmail,
      "Alerts",
      autoOptions,
    );

    expect(suggestRulesFromEmailSamples).toHaveBeenCalled();
  });
});

const ISSUE_URL = "https://github.com/owner/repo/issues/812";
const QA_TESTER = "qa-tester <notifications@github.com>";
const ROW_RECEIVED_AT = new Date("2026-09-01T10:00:00.000Z");
const STATUS_FETCHED_AT = "2026-09-01T11:00:00.000Z";

/** A GitHub issue-comment row whose thread carries a fetched board status. */
function issueRow(
  boardStatus: string | null,
  categoryId: string,
  actor: { from: string; opener: string } = {
    from: QA_TESTER,
    opener: "@qa-tester left a comment (owner/repo#812)",
  },
): ValidationRow {
  return {
    from: actor.from,
    subject: "Re: [owner/repo] Timer drifts after sleep (Issue #812)",
    body: `${actor.opener}\n\nQA — please proceed with testing.\n\nView it on GitHub:\n${ISSUE_URL}`,
    htmlBody: null,
    categoryId,
    receivedAt: ROW_RECEIVED_AT,
    githubMetadata: JSON.stringify({
      links: [
        {
          type: "issue",
          owner: "owner",
          repo: "repo",
          number: 812,
          url: ISSUE_URL,
          status: {
            state: "open",
            ...(boardStatus && {
              projects: [{ name: "Mac App roadmap", status: boardStatus }],
            }),
          },
          fetchedAt: STATUS_FETCHED_AT,
        },
      ],
    }),
  };
}

const QA_SEED: EmailMetadata = {
  from: QA_TESTER,
  subject: "Re: [owner/repo] Timer drifts after sleep (Issue #812)",
  bodyTextForMatch:
    "@qa-tester left a comment (owner/repo#812) QA — please proceed with testing.",
  notificationSubtype: "github:issue:comment:human",
  github: {
    item: "issue",
    reference: { owner: "owner", repo: "repo", number: 812 },
    subtype: "github:issue:comment:human",
    event: "comment",
    actorKind: "human",
    actorLogin: "qa-tester",
    reason: null,
    state: "open",
    authorKind: null,
    authorLogin: null,
    projectStatuses: [{ project: "Mac App roadmap", status: "QA passed" }],
    labels: [],
    reviewStatus: null,
    checksState: null,
    metadataFetchedAt: STATUS_FETCHED_AT,
    metadataStale: false,
  },
};

describe("buildDraftCompositeSpec — GitHub-facts structural path", () => {
  it("drafts a phrase-free `board status = QA passed` rule with no LLM call", async () => {
    const { deps, suggestRulesFromEmailSamples } = buildDeps({
      categoryRows: [
        issueRow("QA passed", TARGET),
        issueRow("QA passed", TARGET),
      ],
      broadRows: [issueRow("QA failed", OTHER), issueRow(null, OTHER)],
    });

    const draft = await buildDraftCompositeSpec(
      deps,
      USER_ID,
      QA_SEED,
      "✅ QA passed issues",
      autoOptions,
    );

    expect(draft?.spec).toEqual(
      expect.objectContaining({
        v: 3,
        fromMatchesAny: ["notifications@github.com"],
        subjectContainsAny: [],
        bodyContainsAny: [],
        githubProjectStatusAny: [
          { status: "QA passed", project: "Mac App roadmap" },
        ],
      }),
    );
    expect(draft?.spec).not.toHaveProperty("notificationSubtypeAny");
    expect(draft?.githubBreakdown).toEqual(
      expect.arrayContaining([
        {
          condition:
            "project board status is one of: Mac App roadmap / QA passed",
          truePositives: 2,
          falsePositives: 0,
        },
      ]),
    );
    expect(suggestRulesFromEmailSamples).not.toHaveBeenCalled();
  });

  it("falls back to the sub-stream path when no GitHub fact separates the categories", async () => {
    // "QA passed" also shows up under another category, so the board status is
    // not clean — but the human-comment sub-stream still is.
    const { deps } = buildDeps({
      categoryRows: [issueRow("QA passed", TARGET)],
      broadRows: [
        issueRow("QA passed", OTHER, {
          from: BOT,
          opener: "@dependabot[bot] left a comment (owner/repo#812)",
        }),
      ],
    });

    const draft = await buildDraftCompositeSpec(
      deps,
      USER_ID,
      QA_SEED,
      "✅ QA passed issues",
      autoOptions,
    );

    expect(draft?.spec).not.toHaveProperty("githubProjectStatusAny");
    expect(draft?.spec).toEqual(
      expect.objectContaining({
        notificationSubtype: "github:issue:comment:human",
      }),
    );
    expect(draft?.githubBreakdown?.length).toBeGreaterThan(0);
  });
});
