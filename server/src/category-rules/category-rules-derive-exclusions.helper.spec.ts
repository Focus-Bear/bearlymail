import { CATEGORY_RULE_COMPOSITE } from "../constants/category-rule-composite.constants";
import { CompositeCategoryRuleSpecV2 } from "../database/entities/category-rule.entity";
import {
  applyDerivedExclusionsAndCheck,
  deriveExclusionsForCompositeRule,
} from "./category-rules-derive-exclusions.helper";
import { DecryptedValidationRow } from "./category-rules-validate.helper";

jest.mock("../encryption/encryption.helper", () => {
  const noopTransformer = {
    to: (value: unknown) => value,
    from: (value: unknown) => value,
  };
  return {
    EncryptionHelper: {
      // Tests pass plaintext rows through manager.query — no real encryption.
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

const normalise = (raw: string): string => {
  const match = raw.match(/<([^>]+)>/) || raw.match(/([^\s]+@[^\s]+)/);
  return (match ? match[1] : raw).toLowerCase().trim();
};

const positiveSpec: CompositeCategoryRuleSpecV2 = {
  v: 2,
  senderMatchesAny: ["alerts@acmecorp.com"],
  subjectContainsAny: ["Build"],
  bodyContainsAny: ["pipeline"],
};

const TARGET_CATEGORY_ID = "cat-build";
const OTHER_CATEGORY_ID = "cat-other";

function buildTargetRow(subject: string, body: string): DecryptedValidationRow {
  return {
    from: "alerts@acmecorp.com",
    subject,
    body,
    categoryId: TARGET_CATEGORY_ID,
  };
}

function buildFpRow(subject: string, body: string): DecryptedValidationRow {
  return {
    from: "alerts@acmecorp.com",
    subject,
    body,
    categoryId: OTHER_CATEGORY_ID,
  };
}

const tpRows = (count: number): DecryptedValidationRow[] =>
  Array.from({ length: count }, () =>
    buildTargetRow("Build failed on main", "the pipeline broke"),
  );

describe("applyDerivedExclusionsAndCheck", () => {
  it("discards the rule when LLM returned no usable exclusions", () => {
    const outcome = applyDerivedExclusionsAndCheck({
      positiveSpec,
      truePositiveRows: tpRows(10),
      falsePositiveRows: [
        buildFpRow("Build summary digest", "the pipeline ran ok"),
      ],
      derived: { subjectNotContainsAny: [], bodyNotContainsAny: [] },
      normaliseSender: normalise,
      targetCategoryId: TARGET_CATEGORY_ID,
    });
    expect(outcome.passes).toBe(false);
    expect(outcome.finalSpec).toBeNull();
    expect(outcome.falsePositives).toBe(1);
  });

  it("applies subject exclusions and re-validates: returns the final spec when FPs drop to 0", () => {
    const outcome = applyDerivedExclusionsAndCheck({
      positiveSpec,
      truePositiveRows: tpRows(10),
      falsePositiveRows: [
        buildFpRow("Build summary digest", "the pipeline ran ok"),
      ],
      derived: {
        subjectNotContainsAny: ["digest"],
        bodyNotContainsAny: [],
      },
      normaliseSender: normalise,
      targetCategoryId: TARGET_CATEGORY_ID,
    });
    expect(outcome.passes).toBe(true);
    expect(outcome.finalSpec).not.toBeNull();
    expect(outcome.finalSpec?.subjectNotContainsAny).toEqual(["digest"]);
    expect(outcome.truePositives).toBe(10);
    expect(outcome.falsePositives).toBe(0);
  });

  it("applies body exclusions and re-validates the same way", () => {
    const outcome = applyDerivedExclusionsAndCheck({
      positiveSpec,
      truePositiveRows: tpRows(10),
      falsePositiveRows: [
        buildFpRow("Build complete", "the pipeline ran ok — to unsubscribe"),
      ],
      derived: {
        subjectNotContainsAny: [],
        bodyNotContainsAny: ["unsubscribe"],
      },
      normaliseSender: normalise,
      targetCategoryId: TARGET_CATEGORY_ID,
    });
    expect(outcome.passes).toBe(true);
    expect(outcome.finalSpec?.bodyNotContainsAny).toEqual(["unsubscribe"]);
  });

  it("passes with exactly AUTO_VALIDATE_MIN_MATCHES surviving true positives", () => {
    // "digest" removes the single FP without touching the TPs, leaving exactly
    // the minimum required matches. Guards the lowered threshold: a sender+
    // subject+body composite rule rarely produces 10 TPs, so the bar is 3.
    const min = CATEGORY_RULE_COMPOSITE.AUTO_VALIDATE_MIN_MATCHES;
    const outcome = applyDerivedExclusionsAndCheck({
      positiveSpec,
      truePositiveRows: tpRows(min),
      falsePositiveRows: [buildFpRow("Build digest", "the pipeline ran ok")],
      derived: { subjectNotContainsAny: ["digest"], bodyNotContainsAny: [] },
      normaliseSender: normalise,
      targetCategoryId: TARGET_CATEGORY_ID,
    });
    expect(outcome.truePositives).toBe(min);
    expect(outcome.falsePositives).toBe(0);
    expect(outcome.passes).toBe(true);
  });

  it("rejects when surviving true positives fall below AUTO_VALIDATE_MIN_MATCHES", () => {
    const min = CATEGORY_RULE_COMPOSITE.AUTO_VALIDATE_MIN_MATCHES;
    const outcome = applyDerivedExclusionsAndCheck({
      positiveSpec,
      truePositiveRows: tpRows(min - 1),
      falsePositiveRows: [buildFpRow("Build digest", "the pipeline ran ok")],
      derived: { subjectNotContainsAny: ["digest"], bodyNotContainsAny: [] },
      normaliseSender: normalise,
      targetCategoryId: TARGET_CATEGORY_ID,
    });
    expect(outcome.passes).toBe(false);
    expect(outcome.finalSpec).toBeNull();
  });

  it("rejects the rule when an exclusion phrase also occurs in TP rows (drops a TP)", () => {
    // The LLM returned "main" — which appears in BOTH TPs and FPs. The safety
    // filter in parseDeriveExclusionsResponse removes it before we get here,
    // so simulate the scenario where the filter missed: applying the
    // exclusion drops every TP, leaving truePositives < AUTO_VALIDATE_MIN_MATCHES.
    const outcome = applyDerivedExclusionsAndCheck({
      positiveSpec,
      truePositiveRows: tpRows(10),
      falsePositiveRows: [buildFpRow("Build digest", "main pipeline summary")],
      derived: {
        subjectNotContainsAny: [],
        bodyNotContainsAny: ["pipeline"],
      },
      normaliseSender: normalise,
      targetCategoryId: TARGET_CATEGORY_ID,
    });
    expect(outcome.passes).toBe(false);
    expect(outcome.finalSpec).toBeNull();
  });

  it("caps applied exclusions at MAX_SUBJECT_NOT_PHRASES / MAX_BODY_NOT_PHRASES", () => {
    const subjectExclusions = Array.from({ length: 30 }, (_, i) => `s${i}`);
    const bodyExclusions = Array.from({ length: 30 }, (_, i) => `b${i}`);
    // Also include "digest" so the FP is actually excluded and the rule passes.
    const outcome = applyDerivedExclusionsAndCheck({
      positiveSpec,
      truePositiveRows: tpRows(10),
      falsePositiveRows: [buildFpRow("Build digest", "the pipeline ran ok")],
      derived: {
        subjectNotContainsAny: ["digest", ...subjectExclusions],
        bodyNotContainsAny: bodyExclusions,
      },
      normaliseSender: normalise,
      targetCategoryId: TARGET_CATEGORY_ID,
    });
    expect(outcome.passes).toBe(true);
    expect(
      outcome.finalSpec?.subjectNotContainsAny?.length,
    ).toBeLessThanOrEqual(10);
    expect(outcome.finalSpec?.bodyNotContainsAny?.length).toBeLessThanOrEqual(
      20,
    );
    // The "digest" phrase that actually distinguishes the FP must be retained
    // (it's the first element in the cap-by-slice).
    expect(outcome.finalSpec?.subjectNotContainsAny).toContain("digest");
  });
});

describe("deriveExclusionsForCompositeRule (orchestrator)", () => {
  const userId = "user-1";
  const categoryName = "CI";

  function buildDeps(opts: {
    rows: DecryptedValidationRow[];
    targetCategoryId: string | null;
    derived?: {
      subjectNotContainsAny: string[];
      bodyNotContainsAny: string[];
    };
  }) {
    const emailThreadRepository = {
      manager: {
        query: jest.fn().mockResolvedValue(opts.rows),
      },
    };
    const llmCategoriesService = {
      deriveExclusionPhrasesFromFalsePositives: jest
        .fn()
        .mockResolvedValue(
          opts.derived ?? { subjectNotContainsAny: [], bodyNotContainsAny: [] },
        ),
    };
    return {
      emailThreadRepository,
      llmCategoriesService,
      categoryId: opts.targetCategoryId,
      logger: { log: jest.fn() },
    };
  }

  it("treats an empty validation window as a pass (new account)", async () => {
    const deps = buildDeps({ rows: [], targetCategoryId: TARGET_CATEGORY_ID });

    const outcome = await deriveExclusionsForCompositeRule({
      ...deps,
      normaliseSender: normalise,
      userId,
      positiveSpec,
      categoryName,
    });
    expect(outcome.passes).toBe(true);
    expect(outcome.finalSpec).toEqual(positiveSpec);
    expect(
      deps.llmCategoriesService.deriveExclusionPhrasesFromFalsePositives,
    ).not.toHaveBeenCalled();
  });

  it("skips the LLM call when the positive-only spec has zero false positives", async () => {
    // 10 TPs, 0 FPs — should pass without calling the derive-exclusions LLM.
    const rows = Array.from({ length: 10 }, () =>
      buildTargetRow("Build failed", "the pipeline broke"),
    );
    const deps = buildDeps({ rows, targetCategoryId: TARGET_CATEGORY_ID });

    const outcome = await deriveExclusionsForCompositeRule({
      ...deps,
      normaliseSender: normalise,
      userId,
      positiveSpec,
      categoryName,
    });
    expect(outcome.passes).toBe(true);
    expect(outcome.falsePositives).toBe(0);
    expect(outcome.finalSpec).toEqual(positiveSpec);
    expect(
      deps.llmCategoriesService.deriveExclusionPhrasesFromFalsePositives,
    ).not.toHaveBeenCalled();
  });

  it("calls the derive-exclusions LLM when FPs exist and applies the returned phrases", async () => {
    const rows = [
      ...Array.from({ length: 10 }, () =>
        buildTargetRow("Build failed", "the pipeline broke"),
      ),
      buildFpRow("Build digest", "the pipeline summary"),
    ];
    const deps = buildDeps({
      rows,
      targetCategoryId: TARGET_CATEGORY_ID,
      derived: {
        subjectNotContainsAny: ["digest"],
        bodyNotContainsAny: [],
      },
    });

    const outcome = await deriveExclusionsForCompositeRule({
      ...deps,
      normaliseSender: normalise,
      userId,
      positiveSpec,
      categoryName,
    });
    expect(
      deps.llmCategoriesService.deriveExclusionPhrasesFromFalsePositives,
    ).toHaveBeenCalledTimes(1);
    expect(outcome.passes).toBe(true);
    expect(outcome.finalSpec?.subjectNotContainsAny).toEqual(["digest"]);
    expect(outcome.falsePositives).toBe(0);
  });

  it("discards the rule when the LLM cannot find FP-distinguishing phrases", async () => {
    const rows = [
      ...Array.from({ length: 10 }, () =>
        buildTargetRow("Build failed", "the pipeline broke"),
      ),
      buildFpRow("Build digest", "the pipeline summary"),
    ];
    const deps = buildDeps({
      rows,
      targetCategoryId: TARGET_CATEGORY_ID,
      // LLM returned empty arrays — no usable separator.
      derived: { subjectNotContainsAny: [], bodyNotContainsAny: [] },
    });

    const outcome = await deriveExclusionsForCompositeRule({
      ...deps,
      normaliseSender: normalise,
      userId,
      positiveSpec,
      categoryName,
    });
    expect(outcome.passes).toBe(false);
    expect(outcome.finalSpec).toBeNull();
  });
});
