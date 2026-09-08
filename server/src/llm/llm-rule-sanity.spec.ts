import {
  buildSanityPromptVariables,
  formatSanityCategories,
  formatSanityGithubBreakdown,
  formatSanityRuleSummary,
  formatSanitySampleEmails,
  formatSanitySubtypeBreakdown,
  parseRuleSanityResponse,
  RULE_SANITY_VERDICTS,
} from "./llm-rule-sanity";

describe("parseRuleSanityResponse", () => {
  it("parses an accept verdict and clamps confidence into 0..1", () => {
    const result = parseRuleSanityResponse(
      '```json\n{"verdict":"accept","confidence":1.7,"reason":"specific sender marker","betterCategoryName":null,"suggestedRevision":null}\n```',
    );
    expect(result).toEqual({
      verdict: RULE_SANITY_VERDICTS.ACCEPT,
      confidence: 1,
      reason: "specific sender marker",
      betterCategoryName: null,
      suggestedRevision: null,
    });
  });

  it("parses a reject verdict with the better-fitting category", () => {
    const result = parseRuleSanityResponse(
      JSON.stringify({
        verdict: "reject",
        confidence: "0.92",
        reason: "QA results belong elsewhere",
        betterCategoryName: " ✅ Github QA passed issues ",
      }),
    );
    expect(result?.verdict).toBe(RULE_SANITY_VERDICTS.REJECT);
    expect(result?.confidence).toBeCloseTo(0.92);
    expect(result?.betterCategoryName).toBe("✅ Github QA passed issues");
  });

  it("parses a revise verdict with a complete revision", () => {
    const result = parseRuleSanityResponse(
      JSON.stringify({
        verdict: "revise",
        confidence: 0.8,
        reason: "drop generic phrase",
        suggestedRevision: {
          fromMatchesAny: ["*@github.com"],
          subjectContainsAny: ["PR #"],
          bodyContainsAny: ["pushed 1 commit", " "],
          subjectNotContainsAny: [],
          bodyNotContainsAny: ["requested your review"],
        },
      }),
    );
    expect(result?.verdict).toBe(RULE_SANITY_VERDICTS.REVISE);
    expect(result?.suggestedRevision).toEqual({
      fromMatchesAny: ["*@github.com"],
      subjectContainsAny: ["PR #"],
      bodyContainsAny: ["pushed 1 commit"],
      subjectNotContainsAny: [],
      bodyNotContainsAny: ["requested your review"],
    });
  });

  it("degrades a revise verdict without a usable revision to reject", () => {
    const result = parseRuleSanityResponse(
      JSON.stringify({
        verdict: "revise",
        confidence: 0.5,
        reason: "too generic",
        suggestedRevision: { fromMatchesAny: ["*@github.com"] },
      }),
    );
    expect(result?.verdict).toBe(RULE_SANITY_VERDICTS.REJECT);
    expect(result?.suggestedRevision).toBeNull();
  });

  it("returns null for missing JSON, malformed JSON, or an unknown verdict", () => {
    expect(parseRuleSanityResponse(null)).toBeNull();
    expect(parseRuleSanityResponse("no json here")).toBeNull();
    expect(parseRuleSanityResponse("{not json")).toBeNull();
    expect(
      parseRuleSanityResponse('{"verdict":"maybe","confidence":0.5}'),
    ).toBeNull();
  });

  it("treats a non-numeric confidence as zero", () => {
    const result = parseRuleSanityResponse(
      '{"verdict":"accept","confidence":"high","reason":"ok"}',
    );
    expect(result?.confidence).toBe(0);
  });
});

describe("prompt formatting", () => {
  it("quotes every phrase so multi-word phrases cannot be misread as a comma list", () => {
    const text = formatSanityRuleSummary({
      senders: ["noreply@sentry.io"],
      subjectContains: ["[Sentry]"],
      bodyContains: ["New issue", "regression"],
      subjectNotContains: [],
      bodyNotContains: ["unsubscribe digest"],
    });
    expect(text).toContain('Body contains any of: "New issue" · "regression"');
    expect(text).toContain("Subject must NOT contain any of: (none)");
    expect(text).toContain(
      'Body must NOT contain any of: "unsubscribe digest"',
    );
  });

  it("lists other categories with descriptions and a placeholder when empty", () => {
    expect(formatSanityCategories([])).toBe("(none)");
    expect(
      formatSanityCategories([
        { name: "Billing", description: "Invoices and receipts" },
        { name: "Other", description: null },
      ]),
    ).toBe("- Billing — Invoices and receipts\n- Other");
  });

  it("numbers sample emails with sender, subject, and a cleaned body preview", () => {
    const text = formatSanitySampleEmails([
      {
        from: "noreply@sentry.io",
        subject: "[Sentry] New issue",
        body: "TypeError in checkout\n\n-- \nsig",
      },
    ]);
    expect(text).toContain("[Email 1]");
    expect(text).toContain("From: noreply@sentry.io");
    expect(text).toContain("Subject: [Sentry] New issue");
    expect(text).toContain("Body preview: TypeError in checkout");
  });

  it("renders the pinned sub-streams and the breakdown for a structural rule", () => {
    const text = formatSanityRuleSummary({
      senders: ["notifications@github.com"],
      subjectContains: [],
      bodyContains: [],
      subjectNotContains: [],
      bodyNotContains: [],
      notificationSubtypes: ["github:pr:comment:bot", "github:pr:push:bot"],
    });
    expect(text).toContain(
      'Notification sub-stream equals or refines one of: "github:pr:comment:bot" · "github:pr:push:bot"',
    );
    expect(text).toContain("Subject contains any of: (none)");

    const breakdown = formatSanitySubtypeBreakdown(
      [
        {
          subtype: "github:pr:comment:bot",
          truePositives: 57,
          falsePositives: 0,
        },
        {
          subtype: "github:pr:comment:human",
          truePositives: 0,
          falsePositives: 84,
        },
      ],
      ["github:pr:comment:bot"],
    );
    expect(breakdown).toBe(
      "- github:pr:comment:bot: 57 in this category, 0 in other categories — PINNED by this rule\n" +
        "- github:pr:comment:human: 0 in this category, 84 in other categories",
    );
    expect(formatSanitySubtypeBreakdown(undefined, [])).toBe("(none)");
    expect(formatSanitySubtypeBreakdown([], [])).toBe("(none)");
  });

  it("builds every template variable, substituting placeholders for empty inputs", () => {
    const variables = buildSanityPromptVariables({
      categoryName: "Alerts",
      categoryDescription: null,
      candidate: {
        senders: ["noreply@sentry.io"],
        subjectContains: ["[Sentry]"],
        bodyContains: ["New issue"],
        subjectNotContains: [],
        bodyNotContains: [],
      },
      otherCategories: [],
      sampleEmails: [],
    });
    expect(variables.categoryName).toBe("Alerts");
    expect(variables.categoryDescription).toBe("(none)");
    expect(variables.ruleSummary).toContain(
      'Sender matches any of: "noreply@sentry.io"',
    );
    expect(variables.otherCategories).toBe("(none)");
    expect(variables.sampleEmails).toBe("(none)");
    expect(variables.ruleSummary).toContain(
      "Notification sub-stream equals or refines one of: (none)",
    );
    expect(variables.subtypeBreakdown).toBe("(none)");
    expect(variables.githubFactsBreakdown).toBe("(none)");
  });

  it("renders the pinned GitHub facts and their breakdown for a facts-pinned rule", () => {
    const text = formatSanityRuleSummary({
      senders: ["notifications@github.com"],
      subjectContains: [],
      bodyContains: [],
      subjectNotContains: [],
      bodyNotContains: [],
      githubConditions: [
        "project board status is one of: Mac App roadmap / QA passed",
      ],
    });
    expect(text).toContain(
      'GitHub facts must satisfy: "project board status is one of: Mac App roadmap / QA passed"',
    );

    const breakdown = formatSanityGithubBreakdown(
      [
        {
          condition:
            "project board status is one of: Mac App roadmap / QA passed",
          truePositives: 42,
          falsePositives: 0,
        },
        {
          condition: "state is one of: closed",
          truePositives: 39,
          falsePositives: 51,
        },
      ],
      ["project board status is one of: Mac App roadmap / QA passed"],
    );
    expect(breakdown).toBe(
      "- project board status is one of: Mac App roadmap / QA passed: 42 in this category, 0 in other categories — PINNED by this rule\n" +
        "- state is one of: closed: 39 in this category, 51 in other categories",
    );
    expect(formatSanityGithubBreakdown(undefined, [])).toBe("(none)");
    expect(formatSanityGithubBreakdown([], [])).toBe("(none)");
  });

  it("passes the GitHub-fact evidence through to the prompt variables", () => {
    const variables = buildSanityPromptVariables({
      categoryName: "✅ QA passed issues",
      categoryDescription: "verified by QA",
      candidate: {
        senders: ["notifications@github.com"],
        subjectContains: [],
        bodyContains: [],
        subjectNotContains: [],
        bodyNotContains: [],
        githubConditions: ["state is one of: merged"],
      },
      otherCategories: [],
      sampleEmails: [],
      githubBreakdown: [
        {
          condition: "state is one of: merged",
          truePositives: 8,
          falsePositives: 0,
        },
      ],
    });
    expect(variables.githubFactsBreakdown).toContain(
      "state is one of: merged: 8 in this category, 0 in other categories — PINNED by this rule",
    );
  });
});
