import {
  JEV_DECISION_KINDS,
  JEV_DECISIONS,
} from "../../constants/jev.constants";
import type { JevAnswer } from "../jev-system-one";
import { JEV_DECISION_REGISTRY } from "./jev-decision.registry";

const noul = (value: number): JevAnswer => ({ type: "noul", noul: value });
const choice = (value: string, confidence = 1): JevAnswer => ({
  type: "choice",
  choice: value,
  confidence,
  probabilities: {},
});
const score = (value: number): JevAnswer => ({
  type: "score",
  score: value,
  confidence: 1,
  probabilities: {},
});

describe("JEV_DECISION_REGISTRY", () => {
  it("maps an exclusion rule choice back to the exact rule text", () => {
    const definition =
      JEV_DECISION_REGISTRY[JEV_DECISION_KINDS.CUSTOM_EXCLUSION_RULES];
    const input = { rules: ["Newsletters", "Automated receipts"] };
    const question = definition.questions(input).rule;
    expect("criteria" in question && question.criteria).toMatchObject({
      "0": "No rule matches",
      "1": "Newsletters",
      "2": "Automated receipts",
    });
    expect(
      definition.compose(input, { rule: choice("2") }).output,
    ).toMatchObject({ matched: true, matchedRule: "Automated receipts" });
    expect(
      definition.compose(input, { rule: choice("0") }).output,
    ).toMatchObject({ matched: false, matchedRule: null });
  });

  it("returns the chosen duplicate number with an honest, non-generated reason", () => {
    const definition =
      JEV_DECISION_REGISTRY[JEV_DECISION_KINDS.CATEGORY_DUPLICATE];
    const input = { candidateNames: ["Invoices", "Receipts"] };
    expect(
      definition.compose(input, { duplicate: choice("1", 0.92) }).output,
    ).toEqual({
      duplicateNumber: 1,
      reasoning: 'Jev judged this equivalent to "Invoices" (confidence 92%).',
    });
  });

  it("only clears clearly legitimate mail; anything else needs the generative check", () => {
    const definition =
      JEV_DECISION_REGISTRY[JEV_DECISION_KINDS.PHISHING_CLEARANCE];
    expect(definition.minConfidence).toBe(
      JEV_DECISIONS.PHISHING_CLEARANCE_MIN_CONFIDENCE,
    );
    const legitimate = definition.compose({}, { risk: choice("legitimate") });
    expect(legitimate).toMatchObject({
      output: { phishing: null },
      generationRequired: false,
    });
    for (const risk of ["phishing", "uncertain"])
      expect(
        definition.compose({}, { risk: choice(risk) }).generationRequired,
      ).toBe(true);
  });

  it("leaves duplicate groups and canonical names to the generative merge", () => {
    const definition =
      JEV_DECISION_REGISTRY[JEV_DECISION_KINDS.MERGE_DUPLICATE_CATEGORIES];
    const input = {
      categories: [
        { name: "A", description: "first" },
        { name: "B", description: "second" },
        { name: "C", description: "third" },
      ],
    };
    expect(Object.keys(definition.questions(input))).toHaveLength(3);
    const none = definition.compose(input, {
      pair_0_1: noul(0),
      pair_0_2: noul(0),
      pair_1_2: noul(0),
    });
    expect(none).toMatchObject({
      output: { duplicate_groups: [] },
      generationRequired: false,
    });
    const grouped = definition.compose(input, {
      pair_0_1: noul(1),
      pair_0_2: noul(0),
      pair_1_2: noul(0),
    });
    expect(grouped.generationRequired).toBe(true);
  });

  it("refuses category lists too large to compare pairwise", () => {
    const definition =
      JEV_DECISION_REGISTRY[JEV_DECISION_KINDS.MERGE_DUPLICATE_CATEGORIES];
    const categories = Array.from({ length: 20 }, (_, index) => ({
      name: `Category ${index}`,
      description: "",
    }));
    expect(() => definition.questions({ categories })).toThrow();
  });

  it("only gates the urgency delta when the full recalculation is skipped", () => {
    const definition =
      JEV_DECISION_REGISTRY[JEV_DECISION_KINDS.INCREMENTAL_PRIORITY];
    const answers = {
      needsFullRecalc: noul(0),
      categoryMightChange: noul(0.5),
      urgencyChange: score(3),
    };
    const skipped = definition.compose({}, answers);
    expect(skipped.output).toMatchObject({
      result: { needsFullRecalc: false, suggestedUrgencyDelta: 15 },
    });
    expect(skipped.usedKeys).toEqual(["needsFullRecalc", "urgencyChange"]);
    const recalc = definition.compose(
      {},
      { ...answers, needsFullRecalc: noul(1) },
    );
    expect(recalc.usedKeys).toEqual(["needsFullRecalc"]);
  });

  it("offers only string arguments as MCP email lookups and copies them exactly", () => {
    const definition =
      JEV_DECISION_REGISTRY[JEV_DECISION_KINDS.MCP_SENDER_TOOL];
    const input = {
      tools: [
        {
          name: "find_person",
          inputSchema: {
            properties: {
              email: { type: "string" },
              limit: { type: "number" },
            },
          },
        },
      ],
    };
    const question = definition.questions(input).tool;
    expect("criteria" in question && Object.keys(question.criteria)).toEqual([
      "0",
      "1",
    ]);
    expect(definition.compose(input, { tool: choice("1") }).output).toEqual({
      toolName: "find_person",
      emailArgName: "email",
    });
    expect(definition.compose(input, { tool: choice("0") }).output).toEqual({
      toolName: null,
      emailArgName: null,
    });
  });

  it("scales email personalisation to the 0-1 contract", () => {
    const definition = JEV_DECISION_REGISTRY[JEV_DECISION_KINDS.EMAIL_TYPE];
    const outcome = definition.compose(
      {},
      {
        isAutomated: noul(1),
        isNewsletter: noul(0),
        isColdOutreach: noul(0),
        isOutOfOffice: noul(0),
        personalizationScore: score(2),
        urgencyLevel: choice("low"),
      },
    );
    expect(outcome.output).toMatchObject({
      isAutomated: true,
      personalizationScore: 0.5,
      urgencyLevel: "low",
    });
  });
});
