import { Logger } from "@nestjs/common";

import { categoriseWithEscalation } from "./llm-categorise-summary";
import { LLM_OP_SUGGEST_PROTO_CATEGORY } from "./llm-operations";

const PARAMS = {
  subject: "Rent notice",
  summary: "Rent increases next month",
  categories: [{ name: "Sales" }],
};
const OTHER = {
  categoryNumber: 0,
  categoryName: "Other",
  categoryConfidence: "HIGH" as const,
  reasoning: 'Jev selected "Other".',
};
const SUGGESTION = {
  name: "🏠 Housing",
  description: "Personal housing notices",
  reasoning: '"Sales" does not cover a rent notice.',
};
const logger = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
} as unknown as Logger;

describe("category selection and independent enrichment", () => {
  it("generates a suggestion only after an Other choice", async () => {
    const client = {
      categoriseWithJev: jest.fn().mockResolvedValue(OTHER),
      generateText: jest
        .fn()
        .mockResolvedValue(
          JSON.stringify({ result: { protoCategorySuggestion: SUGGESTION } }),
        ),
    };
    expect(await categoriseWithEscalation(client, logger, PARAMS)).toEqual({
      ...OTHER,
      protoCategorySuggestion: SUGGESTION,
    });
    expect(client.generateText).toHaveBeenCalledWith(
      expect.objectContaining({ operation: LLM_OP_SUGGEST_PROTO_CATEGORY }),
      "gemini",
      undefined,
    );
  });

  it("retains Other when suggestion generation fails", async () => {
    const client = {
      categoriseWithJev: jest.fn().mockResolvedValue(OTHER),
      generateText: jest.fn().mockRejectedValue(new Error("offline")),
    };
    expect(await categoriseWithEscalation(client, logger, PARAMS)).toEqual(
      OTHER,
    );
  });

  it("avoids Gemini when Jev selected an existing category", async () => {
    const choice = { ...OTHER, categoryNumber: 1, categoryName: "Sales" };
    const client = {
      categoriseWithJev: jest.fn().mockResolvedValue(choice),
      generateText: jest.fn(),
    };
    expect(await categoriseWithEscalation(client, logger, PARAMS)).toEqual(
      choice,
    );
    expect(client.generateText).not.toHaveBeenCalled();
  });

  it("uses Gemini on a failed Jev call and retains its result", async () => {
    const client = {
      categoriseWithJev: jest.fn().mockRejectedValue(new Error("offline")),
      generateText: jest.fn().mockResolvedValue(
        JSON.stringify({
          result: {
            categoryNumber: 1,
            categoryName: "Sales",
            categoryConfidence: "HIGH",
          },
        }),
      ),
    };
    expect(
      (await categoriseWithEscalation(client, logger, PARAMS))?.categoryName,
    ).toBe("Sales");
    expect(client.generateText).toHaveBeenCalledTimes(1);
  });
});
