import { Logger } from "@nestjs/common";
import { Repository } from "typeorm";

import { CompositeCategoryRuleSpecV3 } from "../database/entities/category-rule.entity";
import {
  ContextKey,
  UserContext,
} from "../database/entities/user-context.entity";
import { CategoryRuleSanityService } from "../llm/category-rule-sanity.service";
import {
  RULE_SANITY_VERDICTS,
  RuleSanityCheckResult,
} from "../llm/llm-rule-sanity";
import {
  evaluateRuleSanityGate,
  SANITY_GATE_REASONS,
  SanityGateDeps,
} from "./category-rules-sanity-gate.helper";
import { normalizeCompositeSpec } from "./category-rules-spec-normalizer.helper";

const USER_ID = "user-1";
const TARGET_ID = "cat-monitoring";
const MODEL = "gemini-test";

const candidateSpec: CompositeCategoryRuleSpecV3 = {
  v: 3,
  fromMatchesAny: ["*@github.com"],
  subjectContainsAny: ["Re: [Focus-Bear/mobile-app]"],
  bodyContainsAny: ["QA DONE ✅", "QA FAILED ❌"],
  subjectNotContainsAny: ["Unable to star"],
};

const sampleEmails = [
  {
    from: "notifications@github.com",
    subject: "Re: [Focus-Bear/mobile-app] Login bug (#12)",
    body: "QA DONE ✅ — verified on staging",
  },
];

const accept = (reason = "fine"): RuleSanityCheckResult => ({
  verdict: RULE_SANITY_VERDICTS.ACCEPT,
  confidence: 0.9,
  reason,
  betterCategoryName: null,
  suggestedRevision: null,
});

const reject = (betterCategoryName: string | null = null) => ({
  verdict: RULE_SANITY_VERDICTS.REJECT,
  confidence: 0.95,
  reason: "belongs elsewhere",
  betterCategoryName,
  suggestedRevision: null,
});

const revise = (fromMatchesAny = ["*@github.com"]): RuleSanityCheckResult => ({
  verdict: RULE_SANITY_VERDICTS.REVISE,
  confidence: 0.7,
  reason: "mixes pass and fail",
  betterCategoryName: null,
  suggestedRevision: {
    fromMatchesAny,
    subjectContainsAny: ["Re: [Focus-Bear/mobile-app]"],
    bodyContainsAny: ["QA DONE ✅"],
    subjectNotContainsAny: [],
    bodyNotContainsAny: ["QA FAILED"],
  },
});

describe("evaluateRuleSanityGate", () => {
  let checkRule: jest.Mock;
  let gateRevisedSpec: jest.Mock;
  let deps: SanityGateDeps;
  let isEnabled: boolean;

  const params = () => ({
    userId: USER_ID,
    categoryName: "Content monitoring",
    categoryId: TARGET_ID,
    candidateSpec,
    sampleEmails,
  });

  beforeEach(() => {
    isEnabled = true;
    checkRule = jest.fn();
    gateRevisedSpec = jest.fn(async (spec) => spec);
    const sanityService = {
      checkRule,
      get isEnabled() {
        return isEnabled;
      },
      model: MODEL,
    } as unknown as CategoryRuleSanityService;
    const userContextRepository = {
      find: jest.fn().mockResolvedValue([
        {
          contextId: TARGET_ID,
          contextValue: "Content monitoring - alerts for Focus Bear",
          contextKey: ContextKey.EMAIL_CATEGORY,
        },
        {
          contextId: "cat-qa",
          contextValue:
            "✅ Github QA passed issues - issues QA marked as passed",
          contextKey: ContextKey.EMAIL_CATEGORY,
        },
        {
          contextId: "cat-other",
          contextValue: "Other",
          contextKey: ContextKey.EMAIL_CATEGORY,
        },
      ]),
    } as unknown as Repository<UserContext>;
    deps = {
      sanityService,
      userContextRepository,
      normalizeRevision: (dto) =>
        normalizeCompositeSpec(dto, (sender) => sender.toLowerCase()),
      gateRevisedSpec,
      logger: { log: jest.fn() } as unknown as Logger,
    };
  });

  it("fails open (persists unchecked) when the review is disabled", async () => {
    isEnabled = false;
    const outcome = await evaluateRuleSanityGate(deps, params());
    expect(outcome).toEqual(
      expect.objectContaining({
        shouldPersist: true,
        finalSpec: candidateSpec,
        sanityCheck: null,
        reason: SANITY_GATE_REASONS.UNAVAILABLE,
      }),
    );
    expect(checkRule).not.toHaveBeenCalled();
  });

  it("fails open when the reviewer returns no verdict", async () => {
    checkRule.mockResolvedValue(null);
    const outcome = await evaluateRuleSanityGate(deps, params());
    expect(outcome.shouldPersist).toBe(true);
    expect(outcome.sanityCheck).toBeNull();
    expect(outcome.reason).toBe(SANITY_GATE_REASONS.UNAVAILABLE);
  });

  it("passes the target description, the OTHER categories, and the samples to the reviewer", async () => {
    checkRule.mockResolvedValue(accept());
    await evaluateRuleSanityGate(deps, params());
    expect(checkRule).toHaveBeenCalledWith(
      expect.objectContaining({
        categoryName: "Content monitoring",
        categoryDescription: "alerts for Focus Bear",
        otherCategories: [
          {
            name: "✅ Github QA passed issues",
            description: "issues QA marked as passed",
          },
          { name: "Other", description: null },
        ],
        sampleEmails,
        userId: USER_ID,
        candidate: expect.objectContaining({
          senders: ["*@github.com"],
          bodyContains: ["QA DONE ✅", "QA FAILED ❌"],
          subjectNotContains: ["Unable to star"],
        }),
      }),
    );
  });

  it("accept → persists the candidate with a stored verdict", async () => {
    checkRule.mockResolvedValue(accept("distinctive"));
    const outcome = await evaluateRuleSanityGate(deps, params());
    expect(outcome.shouldPersist).toBe(true);
    expect(outcome.finalSpec).toBe(candidateSpec);
    expect(outcome.reason).toBe(SANITY_GATE_REASONS.ACCEPTED);
    expect(outcome.sanityCheck).toEqual(
      expect.objectContaining({
        verdict: RULE_SANITY_VERDICTS.ACCEPT,
        confidence: 0.9,
        reason: "distinctive",
        model: MODEL,
        revised: false,
      }),
    );
    expect(outcome.sanityCheck?.checkedAt).toEqual(expect.any(String));
  });

  it("reject → does not persist and reports the better category", async () => {
    checkRule.mockResolvedValue(reject("✅ Github QA passed issues"));
    const outcome = await evaluateRuleSanityGate(deps, params());
    expect(outcome.shouldPersist).toBe(false);
    expect(outcome.finalSpec).toBeNull();
    expect(outcome.reason).toBe(SANITY_GATE_REASONS.REJECTED);
    expect(outcome.detail).toContain("✅ Github QA passed issues");
    expect(gateRevisedSpec).not.toHaveBeenCalled();
  });

  it("revise → re-gates the revision, reviews it again, and persists it when accepted", async () => {
    checkRule.mockResolvedValueOnce(revise()).mockResolvedValueOnce(accept());
    const outcome = await evaluateRuleSanityGate(deps, params());

    expect(checkRule).toHaveBeenCalledTimes(2);
    expect(gateRevisedSpec).toHaveBeenCalledTimes(1);
    const revisedSpec = gateRevisedSpec.mock.calls[0][0];
    expect(revisedSpec).toEqual(
      expect.objectContaining({
        v: 3,
        fromMatchesAny: ["*@github.com"],
        bodyContainsAny: ["QA DONE ✅"],
        bodyNotContainsAny: ["QA FAILED"],
      }),
    );
    expect(checkRule.mock.calls[1][0].candidate.bodyContains).toEqual([
      "QA DONE ✅",
    ]);
    expect(outcome.shouldPersist).toBe(true);
    expect(outcome.finalSpec).toEqual(revisedSpec);
    expect(outcome.reason).toBe(SANITY_GATE_REASONS.REVISION_ACCEPTED);
    expect(outcome.sanityCheck).toEqual(
      expect.objectContaining({
        verdict: RULE_SANITY_VERDICTS.REVISE,
        reason: "mixes pass and fail",
        revised: true,
      }),
    );
  });

  it("revise → treated as reject when the second review does not accept", async () => {
    checkRule.mockResolvedValueOnce(revise()).mockResolvedValueOnce(reject());
    const outcome = await evaluateRuleSanityGate(deps, params());
    expect(outcome.shouldPersist).toBe(false);
    expect(outcome.reason).toBe(SANITY_GATE_REASONS.REVISION_REJECTED);
  });

  it("revise → treated as reject when the second review yields no verdict", async () => {
    checkRule.mockResolvedValueOnce(revise()).mockResolvedValueOnce(null);
    const outcome = await evaluateRuleSanityGate(deps, params());
    expect(outcome.shouldPersist).toBe(false);
    expect(outcome.reason).toBe(SANITY_GATE_REASONS.REVISION_REJECTED);
  });

  it("revise → treated as reject when the revision fails the persist gate", async () => {
    checkRule.mockResolvedValueOnce(revise());
    gateRevisedSpec.mockResolvedValue(null);
    const outcome = await evaluateRuleSanityGate(deps, params());
    expect(outcome.shouldPersist).toBe(false);
    expect(outcome.reason).toBe(SANITY_GATE_REASONS.REVISION_REJECTED);
    expect(checkRule).toHaveBeenCalledTimes(1);
  });

  it("revise → rejected when the revision broadens the sender set", async () => {
    checkRule.mockResolvedValueOnce(revise(["*@github.com", "*@gitlab.com"]));
    const outcome = await evaluateRuleSanityGate(deps, params());
    expect(outcome.shouldPersist).toBe(false);
    expect(outcome.reason).toBe(SANITY_GATE_REASONS.REVISION_INVALID);
    expect(gateRevisedSpec).not.toHaveBeenCalled();
  });

  it("revise → rejected when the revision is structurally invalid", async () => {
    checkRule.mockResolvedValueOnce(revise());
    deps.normalizeRevision = () => {
      throw new Error("invalid");
    };
    const outcome = await evaluateRuleSanityGate(deps, params());
    expect(outcome.shouldPersist).toBe(false);
    expect(outcome.reason).toBe(SANITY_GATE_REASONS.REVISION_INVALID);
  });

  it("falls back to name matching for the target when the rule has no categoryId", async () => {
    checkRule.mockResolvedValue(accept());
    await evaluateRuleSanityGate(deps, { ...params(), categoryId: null });
    expect(checkRule.mock.calls[0][0].categoryDescription).toBe(
      "alerts for Focus Bear",
    );
    expect(checkRule.mock.calls[0][0].otherCategories).toHaveLength(2);
  });
});
