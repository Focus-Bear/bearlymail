import { LocalModelPrediction } from "../local-model/local-model.types";
import { LocalModelPromotionService } from "./local-model-promotion.service";

const CONFIDENT: LocalModelPrediction = {
  category: "GitHub PR Updates",
  categoryConfidence: 0.95,
  categoryMargin: 0.3,
  categoryFallback: false,
  family: "GitHub / Pull Requests",
  familyConfidence: 0.97,
  familyFallback: false,
  priorityBand: "high",
  priorityConfidence: 0.9,
  priorityFallback: false,
};

const EMAIL = {
  id: "email-1",
  emailThreadId: "thread-1",
  threadId: "gmail-1",
  subject: "Re: PR",
  body: "body",
  from: "bot@github.com",
  isRead: true,
  labels: ["INBOX"],
  attachments: [],
  receivedAt: new Date("2026-06-14T00:00:00.000Z"),
} as never;

const THREAD = { id: "thread-1", starCount: 0, isBatched: true } as never;

/**
 * Chainable mock for the update query builder used by
 * updateThreadCategoryWithPrecedence. Captures the `.set()` payload so tests
 * can assert on the guarded category write.
 */
function makeUpdateQueryBuilderMock() {
  const builder = {
    update: jest.fn(),
    set: jest.fn(),
    andWhere: jest.fn(),
    execute: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  builder.update.mockReturnValue(builder);
  builder.set.mockReturnValue(builder);
  builder.andWhere.mockReturnValue(builder);
  return builder;
}

function makeService(opts: {
  isLiveEnabled?: boolean;
  holdoutSampleRate?: number;
  prediction?: LocalModelPrediction | null;
  categoryId?: string | null;
  /** Override the user's EMAIL_CATEGORY contexts (for family two-stage tests). */
  contexts?: Array<{ contextId: string; contextValue: string }>;
}) {
  const threadUpdate = jest.fn().mockResolvedValue(undefined);
  const predict = jest.fn().mockResolvedValue(opts.prediction ?? null);
  const putMetric = jest.fn().mockResolvedValue(undefined);
  const maybeQueueBackgroundSummary = jest.fn().mockResolvedValue(undefined);

  const queryBuilder = makeUpdateQueryBuilderMock();
  const emailThreadRepository = {
    update: threadUpdate,
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
  } as never;
  // findCategoryContextIdByName matches on contextValue (case-insensitive).
  const contexts =
    opts.contexts ??
    (opts.categoryId != null
      ? [{ contextId: opts.categoryId, contextValue: "GitHub PR Updates" }]
      : []);
  const userContextRepository = {
    find: jest.fn().mockResolvedValue(contexts),
  } as never;
  const inferenceService = {
    isLiveEnabled: opts.isLiveEnabled ?? true,
    holdoutSampleRate: opts.holdoutSampleRate ?? 0,
    predict,
  } as never;
  const cloudWatchService = { putMetric } as never;
  const backgroundSummaryQueueService = {
    maybeQueueBackgroundSummary,
  } as never;

  const service = new LocalModelPromotionService(
    emailThreadRepository,
    userContextRepository,
    inferenceService,
    cloudWatchService,
    backgroundSummaryQueueService,
  );
  return { service, threadUpdate, queryBuilder, predict, putMetric };
}

describe("LocalModelPromotionService.tryHandle", () => {
  it("does nothing and returns false when live mode is off", async () => {
    const { service, predict } = makeService({
      isLiveEnabled: false,
      prediction: CONFIDENT,
    });
    expect(await service.tryHandle("u1", EMAIL, THREAD, "w1")).toBe(false);
    expect(predict).not.toHaveBeenCalled();
  });

  it("returns false when there is no prediction (cold start / error)", async () => {
    const { service, threadUpdate } = makeService({ prediction: null });
    expect(await service.tryHandle("u1", EMAIL, THREAD, "w1")).toBe(false);
    expect(threadUpdate).not.toHaveBeenCalled();
  });

  it("applies the prediction even when the category head is unsure (priority is decoupled)", async () => {
    const { service, threadUpdate, queryBuilder } = makeService({
      prediction: { ...CONFIDENT, categoryFallback: true },
      categoryId: "cat-1",
    });
    expect(await service.tryHandle("u1", EMAIL, THREAD, "w1")).toBe(true);
    expect(threadUpdate).toHaveBeenCalledTimes(1);
    const [setPayload] = queryBuilder.set.mock.calls[0];
    expect(setPayload.categoryId).toBe("cat-1");
  });

  it("returns false (LLM holdout) when the priority head is unsure", async () => {
    const { service, threadUpdate } = makeService({
      prediction: { ...CONFIDENT, priorityFallback: true },
      categoryId: "cat-1",
    });
    expect(await service.tryHandle("u1", EMAIL, THREAD, "w1")).toBe(false);
    expect(threadUpdate).not.toHaveBeenCalled();
  });

  it("applies priority with a null category when the prediction does not resolve to a user category", async () => {
    const { service, threadUpdate, queryBuilder } = makeService({
      // familyFallback keeps the family two-stage from resolving anything.
      prediction: { ...CONFIDENT, familyFallback: true },
      categoryId: null,
    });
    expect(await service.tryHandle("u1", EMAIL, THREAD, "w1")).toBe(true);
    expect(threadUpdate).toHaveBeenCalledTimes(1);
    const [setPayload] = queryBuilder.set.mock.calls[0];
    expect(setPayload.categoryId).toBeNull();
  });

  it("applies the prediction and skips the LLM when confident and resolvable", async () => {
    const { service, threadUpdate, queryBuilder, putMetric } = makeService({
      prediction: CONFIDENT,
      categoryId: "cat-1",
    });
    expect(await service.tryHandle("u1", EMAIL, THREAD, "w1")).toBe(true);
    expect(threadUpdate).toHaveBeenCalledTimes(1);
    const [where, update] = threadUpdate.mock.calls[0];
    expect(where).toEqual({ id: "thread-1" });
    expect(update).toMatchObject({
      prioritySource: "local",
      // bandMidpointScore('high') = midpoint of [35, 100]
      priorityScore: 68,
      isProcessingPriority: false,
      aiProcessingDeferred: false,
    });
    expect(update.localModelDebug).toMatchObject({
      decidedBy: "local",
      familyAgree: null,
      llmCategory: null,
    });
    expect(queryBuilder.execute).toHaveBeenCalledTimes(1);
    const [setPayload] = queryBuilder.set.mock.calls[0];
    expect(setPayload).toMatchObject({
      categorySource: "local",
      categoryId: "cat-1",
    });
    expect(putMetric).toHaveBeenCalledWith("LocalModelSkip", 1);
  });

  it("persists the model's resolved category id (no GitHub override)", async () => {
    const { service, queryBuilder } = makeService({
      prediction: CONFIDENT,
      categoryId: "cat-1",
    });
    expect(await service.tryHandle("u1", EMAIL, THREAD, "w1")).toBe(true);
    const [setPayload] = queryBuilder.set.mock.calls[0];
    expect(setPayload.categoryId).toBe("cat-1");
    expect(setPayload.categoryDecisionTrace.steps).toHaveLength(1);
    expect(setPayload.categoryDecisionTrace.steps[0]).toMatchObject({
      step: "local-model",
      outcome: "applied",
    });
  });
});

describe("LocalModelPromotionService — family two-stage + holdout", () => {
  const PRIORITY_CONFIDENT_CATEGORY_UNSURE: LocalModelPrediction = {
    ...CONFIDENT,
    category: "Some category the user does not have",
    categoryFallback: true,
    family: "GitHub / Pull Requests",
    familyFallback: false,
  };

  it("applies local priority and leaves category null (Other) when the category head is unsure — NOT analyze_priority", async () => {
    const { service, threadUpdate, queryBuilder, putMetric } = makeService({
      prediction: PRIORITY_CONFIDENT_CATEGORY_UNSURE,
      // No category resolves and the head is unconfident: priority still lands
      // locally and the thread sits in "Other" — the deferred summary-based
      // re-categorisation (cheap categorise_summary) classifies it later. We do
      // NOT bail to the expensive analyze_priority just to categorise.
      contexts: [],
    });
    expect(await service.tryHandle("u1", EMAIL, THREAD, "w1")).toBe(true);
    const [, update] = threadUpdate.mock.calls[0];
    expect(update).toMatchObject({
      prioritySource: "local",
      priorityScore: 68,
    });
    const [setPayload] = queryBuilder.set.mock.calls[0];
    expect(setPayload).toMatchObject({
      categorySource: "local",
      categoryId: null,
    });
    expect(setPayload.categoryDecisionTrace.finalCategoryId).toBeNull();
    // The explanation must flag it as awaiting re-categorisation, not a dead end.
    expect(setPayload.categoryExplanation).toContain("awaiting");
    expect(putMetric).toHaveBeenCalledWith("LocalModelSkip", 1);
  });

  it("applies local priority with category null when the category head is CONFIDENT but maps to no user category (genuine Other)", async () => {
    const { service, threadUpdate, queryBuilder, putMetric } = makeService({
      // Confident category head (categoryFallback=false) that resolves to no
      // real user category — a genuine "Other". Priority lands, LLM skipped.
      prediction: {
        ...CONFIDENT,
        category: "Other",
        family: "Other / Uncategorised",
        categoryFallback: false,
        familyFallback: false,
      },
      contexts: [],
    });
    expect(await service.tryHandle("u1", EMAIL, THREAD, "w1")).toBe(true);
    const [, update] = threadUpdate.mock.calls[0];
    expect(update).toMatchObject({
      prioritySource: "local",
      priorityScore: 68,
    });
    const [setPayload] = queryBuilder.set.mock.calls[0];
    expect(setPayload).toMatchObject({
      categorySource: "local",
      categoryId: null,
    });
    expect(setPayload.categoryDecisionTrace.finalCategoryId).toBeNull();
    expect(putMetric).toHaveBeenCalledWith("LocalModelSkip", 1);
  });

  it("family two-stage resolves to the sole category in the predicted family", async () => {
    const { service, queryBuilder } = makeService({
      prediction: PRIORITY_CONFIDENT_CATEGORY_UNSURE,
      // Direct name match fails, but exactly one category maps to the PR family.
      contexts: [{ contextId: "fam-1", contextValue: "GitHub PR Updates" }],
    });
    expect(await service.tryHandle("u1", EMAIL, THREAD, "w1")).toBe(true);
    const [setPayload] = queryBuilder.set.mock.calls[0];
    expect(setPayload.categoryId).toBe("fam-1");
    expect(setPayload.categorySource).toBe("local");
  });

  it("priority head unsure always holds out", async () => {
    const { service, threadUpdate } = makeService({
      prediction: { ...CONFIDENT, priorityFallback: true },
      categoryId: "cat-1",
    });
    expect(await service.tryHandle("u1", EMAIL, THREAD, "w1")).toBe(false);
    expect(threadUpdate).not.toHaveBeenCalled();
  });

  it("holdout eval: a would-apply thread is diverted to the LLM (no write) at rate 100", async () => {
    const { service, threadUpdate, queryBuilder, putMetric } = makeService({
      holdoutSampleRate: 100,
      prediction: CONFIDENT,
      categoryId: "cat-1",
    });
    expect(await service.tryHandle("u1", EMAIL, THREAD, "w1")).toBe(false);
    expect(threadUpdate).not.toHaveBeenCalled();
    expect(queryBuilder.execute).not.toHaveBeenCalled();
    expect(putMetric).not.toHaveBeenCalled();
  });

  it("holdout eval: rate 0 applies as normal", async () => {
    const { service, threadUpdate, queryBuilder } = makeService({
      holdoutSampleRate: 0,
      prediction: CONFIDENT,
      categoryId: "cat-1",
    });
    expect(await service.tryHandle("u1", EMAIL, THREAD, "w1")).toBe(true);
    expect(threadUpdate).toHaveBeenCalledTimes(1);
    expect(queryBuilder.execute).toHaveBeenCalledTimes(1);
  });
});
