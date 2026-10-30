import { parseQaExtractionResponse } from "./qa-extraction-response";

const WEEKEND_FAQ = {
  question: "Are you open on weekends?",
  answer: "Yes, we're open Saturdays 9am to 3pm.",
  pairIds: [1, 2],
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
