import { CATEGORY_RULE_COMPOSITE } from "../constants/category-rule-composite.constants";
import {
  buildNotificationSubtypeBreakdown,
  selectCleanSubtypes,
} from "./category-rules-subtype-breakdown.helper";
import type { DecryptedValidationRow } from "./category-rules-validate.helper";

const TARGET = "cat-bot-pr-updates";
const OTHER = "cat-human-pr-updates";
const PR_URL = "https://github.com/owner/repo/pull/430";

const normalise = (raw: string): string => {
  const match = raw.match(/<([^>]+)>/) || raw.match(/([^\s]+@[^\s]+)/);
  return (match ? match[1] : raw).toLowerCase().trim();
};

function row(
  from: string,
  opener: string,
  categoryId: string | null,
  subject = "Re: [owner/repo] Bump ws (PR #430)",
): DecryptedValidationRow {
  return {
    from,
    subject,
    body: `${opener}\n\n-- \nReply to this email directly or view it on GitHub:\n${PR_URL}\nYou are receiving this because you are subscribed to this thread.`,
    htmlBody: null,
    categoryId,
  };
}

const BOT = '"dependabot[bot]" <notifications@github.com>';
const HUMAN = "octocat <notifications@github.com>";
const botComment = (categoryId: string | null) =>
  row(BOT, "@dependabot[bot] left a comment (owner/repo#430)", categoryId);
const botPush = (categoryId: string | null) =>
  row(BOT, "@dependabot[bot] pushed 1 commit.", categoryId);
const humanComment = (categoryId: string | null) =>
  row(HUMAN, "@octocat left a comment (owner/repo#430)", categoryId);
const humanMerged = (categoryId: string | null) =>
  row(HUMAN, "Merged #430 into main.", categoryId);

describe("buildNotificationSubtypeBreakdown", () => {
  it("counts true positives from the category window and false positives from the broad window, per sub-stream", () => {
    const breakdown = buildNotificationSubtypeBreakdown({
      categoryRows: [
        botComment(TARGET),
        botComment(TARGET),
        botPush(TARGET),
        humanComment(TARGET),
      ],
      // Target-category rows in the broad window are not false positives.
      broadRows: [
        botComment(TARGET),
        humanComment(OTHER),
        humanComment(OTHER),
        humanMerged(OTHER),
      ],
      senderPatterns: ["notifications@github.com"],
      normaliseSender: normalise,
      targetCategoryId: TARGET,
    });
    expect(breakdown).toEqual([
      { subtype: "github:pr:comment:bot", truePositives: 2, falsePositives: 0 },
      {
        subtype: "github:pr:comment:human",
        truePositives: 1,
        falsePositives: 2,
      },
      { subtype: "github:pr:push:bot", truePositives: 1, falsePositives: 0 },
      {
        subtype: "github:pr:merged:human",
        truePositives: 0,
        falsePositives: 1,
      },
    ]);
  });

  it("ignores rows from other senders and rows with no resolvable sub-stream", () => {
    const breakdown = buildNotificationSubtypeBreakdown({
      categoryRows: [
        row("alerts@sentry.io", "New issue", TARGET),
        {
          from: HUMAN,
          subject: "Weekly digest",
          body: "no links",
          htmlBody: null,
          categoryId: TARGET,
        },
        botPush(TARGET),
      ],
      broadRows: [],
      senderPatterns: ["*@github.com"],
      normaliseSender: normalise,
      targetCategoryId: TARGET,
    });
    expect(breakdown).toEqual([
      { subtype: "github:pr:push:bot", truePositives: 1, falsePositives: 0 },
    ]);
  });
});

describe("selectCleanSubtypes", () => {
  const breakdown = [
    { subtype: "github:pr:comment:bot", truePositives: 57, falsePositives: 0 },
    { subtype: "github:pr:push:bot", truePositives: 31, falsePositives: 0 },
    {
      subtype: "github:pr:comment:human",
      truePositives: 3,
      falsePositives: 84,
    },
    { subtype: "github:pr:merged:human", truePositives: 0, falsePositives: 40 },
  ];

  it("keeps sub-streams with true positives and zero false positives", () => {
    expect(selectCleanSubtypes(breakdown, "github:pr:comment:bot")).toEqual([
      "github:pr:comment:bot",
      "github:pr:push:bot",
    ]);
  });

  it("adds the seed sub-stream when it is absent from the windows (its thread is being filed now)", () => {
    expect(selectCleanSubtypes(breakdown, "github:pr:opened:bot")).toEqual([
      "github:pr:opened:bot",
      "github:pr:comment:bot",
      "github:pr:push:bot",
    ]);
  });

  it("drops a seed sub-stream that has false positives, keeping the clean rest", () => {
    expect(selectCleanSubtypes(breakdown, "github:pr:comment:human")).toEqual([
      "github:pr:comment:bot",
      "github:pr:push:bot",
    ]);
  });

  it("returns an empty set when nothing is clean and the seed is dirty", () => {
    expect(
      selectCleanSubtypes(
        [
          {
            subtype: "github:pr:comment:human",
            truePositives: 3,
            falsePositives: 84,
          },
        ],
        "github:pr:comment:human",
      ),
    ).toEqual([]);
  });

  it("caps the set at MAX_NOTIFICATION_SUBTYPES", () => {
    const many = Array.from({ length: 20 }, (_, index) => ({
      subtype: `github:pr:event${index}:bot`,
      truePositives: 20 - index,
      falsePositives: 0,
    }));
    expect(selectCleanSubtypes(many, "github:pr:event0:bot")).toHaveLength(
      CATEGORY_RULE_COMPOSITE.MAX_NOTIFICATION_SUBTYPES,
    );
  });
});
