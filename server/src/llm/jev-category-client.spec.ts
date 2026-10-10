import { JEV } from "../constants/jev.constants";
import { JevCategoryClient } from "./jev-category-client";
import { LLM_OP_CATEGORISE_SUMMARY } from "./llm-operations";

const PARAMS = {
  subject: "QA done",
  summary: "The fix passed QA",
  userId: "test-user",
  categories: [{ name: "QA passed", description: "Verified fixes" }],
};
const API_KEY = "test-only";
const response = (choice = "1", confidence = 1) => ({
  model: JEV.DEFAULT_MODEL,
  answers: {
    category: {
      type: "choice",
      choice,
      confidence,
      probabilities: { "0": 0, "1": 1 },
    },
  },
  usage: { input_tokens: 100, output_tokens: 10 },
});

describe("JevCategoryClient", () => {
  const usage = { logUsage: jest.fn().mockResolvedValue(undefined) };
  const logger = { warn: jest.fn() };
  const client = new JevCategoryClient(
    (key) => (key === JEV.API_KEY_ENV ? API_KEY : undefined),
    logger,
    usage,
  );
  let fetchMock: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock = jest.spyOn(global, "fetch");
  });
  afterEach(() => jest.restoreAllMocks());

  it("uses exact category identity, an honest explanation and actual usage", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(response())));
    expect(await client.categorise(PARAMS)).toEqual({
      categoryNumber: 1,
      categoryName: "QA passed",
      categoryConfidence: "HIGH",
      reasoning: 'Jev selected "QA passed" (choice confidence 100%).',
    });
    expect(usage.logUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: JEV.PROVIDER,
        operation: LLM_OP_CATEGORISE_SUMMARY,
        model: JEV.DEFAULT_MODEL,
        totalTokens: 110,
        userId: PARAMS.userId,
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      JEV.API_URL,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("accepts a confident Other verdict without fabricating a new category", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(response(JEV.OTHER_OPTION))),
    );
    const result = await client.categorise(PARAMS);
    expect(result?.categoryName).toBe(JEV.OTHER_CATEGORY);
    expect(result?.protoCategorySuggestion).toBeUndefined();
  });

  it.each([JEV.MIN_ACCEPTED_CONFIDENCE - 0.01, 0])(
    "falls back below confidence threshold (%s)",
    async (confidence) => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify(response("1", confidence))),
      );
      expect(await client.categorise(PARAMS)).toBeNull();
      expect(usage.logUsage).toHaveBeenCalledTimes(1);
    },
  );

  it("accepts the threshold boundary", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(response("1", JEV.MIN_ACCEPTED_CONFIDENCE))),
    );
    expect(await client.categorise(PARAMS)).not.toBeNull();
  });

  it.each([
    { apiKey: undefined, enabled: undefined },
    { apiKey: API_KEY, enabled: "false" },
  ])(
    "does not send data when unavailable (%s)",
    async ({ apiKey, enabled }) => {
      const disabled = new JevCategoryClient(
        (key) => (key === JEV.API_KEY_ENV ? apiKey : enabled),
        logger,
        usage,
      );
      expect(await disabled.categorise(PARAMS)).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("falls back on a timeout without logging email contents or credential", async () => {
    fetchMock.mockRejectedValue(
      new Error(`sensitive ${API_KEY} ${PARAMS.summary}`),
    );
    expect(await client.categorise(PARAMS)).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      "Jev categorisation unavailable; falling back to Gemini",
    );
  });

  it("rejects unknown choices and unsupported taxonomy sizes", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(response("99"))));
    expect(await client.categorise(PARAMS)).toBeNull();
    fetchMock.mockClear();
    expect(
      await client.categorise({
        ...PARAMS,
        categories: Array.from({ length: JEV.MAX_OPTIONS }, (_, i) => ({
          name: String(i),
        })),
      }),
    ).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
