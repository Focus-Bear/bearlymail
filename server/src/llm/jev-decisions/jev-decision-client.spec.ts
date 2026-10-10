import {
  JEV,
  JEV_DECISION_KINDS,
  JEV_DECISIONS,
} from "../../constants/jev.constants";
import { ENV_BOOLEAN_STRING } from "../../constants/service-constants";
import type { LLMRequest } from "../llm.types";
import { LLM_OP_EVALUATE_WORKFLOW_CONDITION } from "../llm-operations";
import { JevDecisionClient } from "./jev-decision-client";

const API_KEY = "test-only";
const REQUEST: LLMRequest = {
  prompt: "CONDITION: asks us to pay an invoice\nBODY: Please pay invoice 104.",
  systemPrompt: "You are an email classifier.",
  operation: LLM_OP_EVALUATE_WORKFLOW_CONDITION,
  jevDecision: { kind: JEV_DECISION_KINDS.WORKFLOW_CONDITION, input: {} },
};
const jevResponse = (noul: number) => ({
  model: JEV.DEFAULT_MODEL,
  answers: { matches: { type: "noul", noul } },
  usage: { input_tokens: 200, output_tokens: 5 },
});

describe("JevDecisionClient", () => {
  const usage = { logUsage: jest.fn().mockResolvedValue(undefined) };
  const logger = { warn: jest.fn() };
  let config: Record<string, string | undefined>;
  const client = new JevDecisionClient((key) => config[key], logger, usage);
  let fetchMock: jest.SpyInstance;
  const respondWith = (body: unknown) =>
    fetchMock.mockResolvedValue(new Response(JSON.stringify(body)));

  beforeEach(() => {
    jest.clearAllMocks();
    config = { [JEV.API_KEY_ENV]: API_KEY };
    fetchMock = jest.spyOn(global, "fetch");
  });
  afterEach(() => jest.restoreAllMocks());

  it("returns the caller's JSON contract when Jev is confident", async () => {
    respondWith(jevResponse(0.99));
    expect(await client.decide(REQUEST, "user-1")).toBe('{"matches":true}');
    expect(usage.logUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        operation: LLM_OP_EVALUATE_WORKFLOW_CONDITION,
        provider: JEV.PROVIDER,
        totalTokens: 205,
      }),
    );
  });

  it("sends the policy once in state rather than in every question", async () => {
    respondWith(jevResponse(0.01));
    await client.decide(REQUEST);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.state.policyAndInput).toBe(
      `${REQUEST.systemPrompt}\n\n${REQUEST.prompt}`,
    );
    expect(body.questions.matches.instructions).not.toContain(REQUEST.prompt);
    expect(body.questions.matches.instructions).toContain(
      JEV_DECISIONS.POLICY_REFERENCE,
    );
  });

  it("falls back when an answer is below the confidence threshold", async () => {
    respondWith(jevResponse(0.6));
    expect(await client.decide(REQUEST)).toBeNull();
  });

  it("falls back when the contract needs generated text", async () => {
    respondWith({
      model: JEV.DEFAULT_MODEL,
      answers: {
        risk: {
          type: "choice",
          choice: "phishing",
          confidence: 1,
          probabilities: { legitimate: 0, phishing: 1, uncertain: 0 },
        },
      },
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    expect(
      await client.decide({
        ...REQUEST,
        jevDecision: { kind: JEV_DECISION_KINDS.PHISHING_CLEARANCE, input: {} },
      }),
    ).toBeNull();
  });

  it.each([
    ["the request has no decision", { ...REQUEST, jevDecision: undefined }, {}],
    ["no API key is configured", REQUEST, { [JEV.API_KEY_ENV]: undefined }],
    [
      "decisions are disabled",
      REQUEST,
      { [JEV_DECISIONS.ENABLED_ENV]: ENV_BOOLEAN_STRING.FALSE },
    ],
  ])("makes no request when %s", async (_case, request, overrides) => {
    config = { ...config, ...overrides };
    expect(await client.decide(request)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back with a content-free warning when Jev fails", async () => {
    fetchMock.mockRejectedValue(new Error("Please pay invoice 104"));
    expect(await client.decide(REQUEST)).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.not.stringContaining("invoice"),
    );
  });
});
