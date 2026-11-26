import * as fs from "fs";
import * as yaml from "js-yaml";
import * as path from "path";

import {
  parseQaExtractionResponse,
  QA_ANSWER_KINDS,
  QA_EXTRACTION_RESPONSE_SCHEMA,
} from "./qa-extraction-response";

const PROMPTFOO_SUITE = path.join(
  __dirname,
  "../../promptfoo/extract-common-questions.yaml",
);

interface PromptfooSuite {
  providers: Array<{ config?: { responseSchema?: unknown } }>;
}

const WEEKEND_FAQ = {
  question: "Are you open on weekends?",
  answer: "Yes, we're open Saturdays 9am to 3pm.",
  pairIds: [1, 2],
  answerKind: QA_ANSWER_KINDS.REUSABLE,
  confidence: 0.9,
};

describe("parseQaExtractionResponse", () => {
  it("reads the qa_pairs object", () => {
    expect(
      parseQaExtractionResponse(JSON.stringify({ qa_pairs: [WEEKEND_FAQ] })),
    ).toEqual([WEEKEND_FAQ]);
  });

  it("reads a reply wrapped in a code fence", () => {
    const fenced = `\`\`\`json\n${JSON.stringify({ qa_pairs: [WEEKEND_FAQ] })}\n\`\`\``;

    expect(parseQaExtractionResponse(fenced)).toEqual([WEEKEND_FAQ]);
  });

  it("returns nothing for an empty list", () => {
    expect(parseQaExtractionResponse('{ "qa_pairs": [] }')).toEqual([]);
  });

  it("drops entries without pair ids, which could never be checked against real askers", () => {
    const legacyShape = {
      question: "Did you receive my invitation?",
      answer: "Confirm attendance",
      frequency: 3,
    };

    expect(
      parseQaExtractionResponse(
        JSON.stringify({ qa_pairs: [legacyShape, WEEKEND_FAQ] }),
      ),
    ).toEqual([WEEKEND_FAQ]);
  });

  it("drops entries with non-integer pair ids", () => {
    const badIds = { ...WEEKEND_FAQ, pairIds: ["1", "2"] };

    expect(
      parseQaExtractionResponse(JSON.stringify({ qa_pairs: [badIds] })),
    ).toEqual([]);
  });

  it("keeps entries the model judged not reusable; the quality gate drops them", () => {
    const caseSpecific = {
      ...WEEKEND_FAQ,
      answerKind: QA_ANSWER_KINDS.CASE_SPECIFIC,
    };

    expect(
      parseQaExtractionResponse(JSON.stringify({ qa_pairs: [caseSpecific] })),
    ).toEqual([caseSpecific]);
  });

  it.each([
    ["missing", undefined],
    ["unknown", "probably_fine"],
  ])(
    "drops entries whose answerKind is %s, which were never judged reusable",
    (_reason, answerKind) => {
      const unjudged = { ...WEEKEND_FAQ, answerKind };

      expect(
        parseQaExtractionResponse(JSON.stringify({ qa_pairs: [unjudged] })),
      ).toEqual([]);
    },
  );

  it("returns nothing when the list is under some other key", () => {
    expect(
      parseQaExtractionResponse(JSON.stringify({ faqs: [WEEKEND_FAQ] })),
    ).toEqual([]);
  });

  it("returns nothing for a reply with no JSON object", () => {
    expect(parseQaExtractionResponse("No recurring questions found.")).toEqual(
      [],
    );
  });
});

describe("QA_EXTRACTION_RESPONSE_SCHEMA", () => {
  it("is the schema the promptfoo suite sends, so the suite tests what production runs", () => {
    const suite = yaml.load(
      fs.readFileSync(PROMPTFOO_SUITE, "utf8"),
    ) as PromptfooSuite;

    for (const provider of suite.providers) {
      expect(provider.config?.responseSchema).toEqual(
        QA_EXTRACTION_RESPONSE_SCHEMA,
      );
    }
  });
});
