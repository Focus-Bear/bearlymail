import {
  parsePriorityBatchLambdaMessage,
  PRIORITY_BATCH_MESSAGE_VERSION,
} from "./priority-batch-lambda-message";

const VALID = {
  version: PRIORITY_BATCH_MESSAGE_VERSION,
  userId: "user-1",
  analysisId: "analysis-1",
  emailIds: ["email-1"],
};

describe("parsePriorityBatchLambdaMessage", () => {
  it("accepts a v2 ids-only message and drops unknown fields", () => {
    const body = JSON.stringify({ ...VALID, emails: [{ body: "secret" }] });
    expect(parsePriorityBatchLambdaMessage(body)).toEqual(VALID);
  });

  it("rejects the legacy v1 payload so stale messages fail loudly", () => {
    expect(() =>
      parsePriorityBatchLambdaMessage(JSON.stringify({ ...VALID, version: 1 })),
    ).toThrow("Unsupported priority batch message version: 1");
  });

  it.each([
    ["missing userId", { ...VALID, userId: undefined }],
    ["missing analysisId", { ...VALID, analysisId: 42 }],
    ["empty emailIds", { ...VALID, emailIds: [] }],
    ["non-string emailIds", { ...VALID, emailIds: [1] }],
  ])("rejects a message with %s", (_label, message) => {
    expect(() =>
      parsePriorityBatchLambdaMessage(JSON.stringify(message)),
    ).toThrow("missing userId/analysisId/emailIds");
  });

  it("rejects a non-object body", () => {
    expect(() => parsePriorityBatchLambdaMessage("null")).toThrow(
      "not an object",
    );
  });
});
