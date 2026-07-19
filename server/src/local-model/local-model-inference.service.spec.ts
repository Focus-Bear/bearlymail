import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { LambdaClient } from "@aws-sdk/client-lambda";

import { EmailThread } from "../database/entities/email-thread.entity";
import { LocalModelThreadInput } from "./local-model.types";
import { LocalModelInferenceService } from "./local-model-inference.service";

const THREAD: LocalModelThreadInput = {
  threadId: "t1",
  subject: "Re: PR #4680",
  body: "commented on this pull request",
  senderDomain: ".*@github\\.com$",
  senderHash: "abc",
  isReceived: true,
  isRead: true,
  hasAttachments: false,
  receivedAt: "2026-06-13T05:00:00.000Z",
  threadLength: 3,
};

const PREDICTION = {
  category: "GitHub PR Updates",
  categoryConfidence: 0.9,
  categoryMargin: 0.4,
  categoryFallback: false,
  family: "GitHub / Pull Requests",
  familyConfidence: 0.95,
  familyFallback: false,
  priorityBand: "med",
  priorityConfidence: 0.8,
  priorityFallback: false,
};

function lambdaPayload(body: unknown, statusCode = 200) {
  return {
    Payload: Buffer.from(
      JSON.stringify({ statusCode, body: JSON.stringify(body) }),
    ),
  };
}

const threadUpdate = jest.fn();

async function makeService(
  env: Record<string, string>,
  sendImpl: jest.Mock,
): Promise<LocalModelInferenceService> {
  jest.spyOn(LambdaClient.prototype, "send").mockImplementation(sendImpl);
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      LocalModelInferenceService,
      { provide: ConfigService, useValue: { get: (key: string) => env[key] } },
      {
        provide: getRepositoryToken(EmailThread),
        useValue: { update: threadUpdate },
      },
    ],
  }).compile();
  return module.get(LocalModelInferenceService);
}

describe("LocalModelInferenceService", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    threadUpdate.mockReset();
  });

  it("returns null when no function is configured (no-op)", async () => {
    const send = jest.fn();
    const service = await makeService({}, send);
    expect(service.isConfigured()).toBe(false);
    expect(await service.predict("u1", THREAD)).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it("parses a successful prediction", async () => {
    const send = jest.fn().mockResolvedValue(lambdaPayload(PREDICTION));
    const service = await makeService(
      { LOCAL_MODEL_INFERENCE_FUNCTION: "fn" },
      send,
    );
    const result = await service.predict("u1", THREAD);
    expect(result?.family).toBe("GitHub / Pull Requests");
    expect(result?.categoryFallback).toBe(false);
  });

  it("returns null on a Lambda FunctionError", async () => {
    const send = jest.fn().mockResolvedValue({
      FunctionError: "Unhandled",
      Payload: Buffer.from("{}"),
    });
    const service = await makeService(
      { LOCAL_MODEL_INFERENCE_FUNCTION: "fn" },
      send,
    );
    expect(await service.predict("u1", THREAD)).toBeNull();
  });

  it("returns null when the invoke throws (model outage never blocks processing)", async () => {
    const send = jest.fn().mockRejectedValue(new Error("timeout"));
    const service = await makeService(
      { LOCAL_MODEL_INFERENCE_FUNCTION: "fn" },
      send,
    );
    expect(await service.predict("u1", THREAD)).toBeNull();
  });

  it("returns null on a 4xx/5xx envelope (e.g. bad request)", async () => {
    const send = jest
      .fn()
      .mockResolvedValue(lambdaPayload({ error: "bad" }, 400));
    const service = await makeService(
      { LOCAL_MODEL_INFERENCE_FUNCTION: "fn" },
      send,
    );
    expect(await service.predict("u1", THREAD)).toBeNull();
  });

  describe("compareInShadowMode", () => {
    it("does nothing when shadow mode is off", async () => {
      const send = jest.fn().mockResolvedValue(lambdaPayload(PREDICTION));
      const service = await makeService(
        { LOCAL_MODEL_INFERENCE_FUNCTION: "fn" },
        send,
      );
      expect(
        await service.compareInShadowMode("u1", THREAD, { category: "x" }),
      ).toBeNull();
      expect(send).not.toHaveBeenCalled();
    });

    it("predicts and returns the prediction when shadow mode is on", async () => {
      const send = jest.fn().mockResolvedValue(lambdaPayload(PREDICTION));
      const service = await makeService(
        {
          LOCAL_MODEL_INFERENCE_FUNCTION: "fn",
          LOCAL_MODEL_SHADOW_ENABLED: "true",
        },
        send,
      );
      const result = await service.compareInShadowMode("u1", THREAD, {
        category: "GitHub PR Updates",
        priorityBand: "high",
      });
      expect(result?.family).toBe("GitHub / Pull Requests");
      expect(send).toHaveBeenCalledTimes(1);
    });
  });

  describe("shadowCompareEmail persistence", () => {
    const email = {
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

    it("persists the decision snapshot on the thread when shadow is on", async () => {
      const send = jest.fn().mockResolvedValue(lambdaPayload(PREDICTION));
      const service = await makeService(
        {
          LOCAL_MODEL_INFERENCE_FUNCTION: "fn",
          LOCAL_MODEL_SHADOW_ENABLED: "true",
        },
        send,
      );
      await service.shadowCompareEmail("u1", email, "GitHub PR Updates", 50);

      expect(threadUpdate).toHaveBeenCalledTimes(1);
      const [where, update] = threadUpdate.mock.calls[0];
      expect(where).toEqual({ id: "thread-1" });
      expect(update.localModelDebug).toMatchObject({
        decidedBy: "llm",
        category: "GitHub PR Updates",
        family: "GitHub / Pull Requests",
        llmCategory: "GitHub PR Updates",
        categoryAgree: true,
        priorityBand: "med",
        llmPriorityBand: "high",
        priorityAgree: false,
        llmFamily: "GitHub / Pull Requests",
        familyAgree: true,
      });
    });

    it("does not persist when shadow mode is off", async () => {
      const send = jest.fn();
      const service = await makeService(
        { LOCAL_MODEL_INFERENCE_FUNCTION: "fn" },
        send,
      );
      await service.shadowCompareEmail("u1", email, "x", 5);
      expect(threadUpdate).not.toHaveBeenCalled();
    });
  });
});
