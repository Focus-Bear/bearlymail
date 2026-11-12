import { SqsService } from "../aws/sqs.service";
import {
  PRIORITY_BATCH_MESSAGE_VERSION,
  type PriorityBatchLambdaMessage,
} from "./priority-batch-lambda-message";
import { PrioritySqsDispatchService } from "./priority-sqs-dispatch.service";

const MESSAGE: PriorityBatchLambdaMessage = {
  version: PRIORITY_BATCH_MESSAGE_VERSION,
  userId: "user-1",
  analysisId: "analysis-1",
  emailIds: ["email-1", "email-2"],
};

describe("PrioritySqsDispatchService", () => {
  let sendPrioritisationMessage: jest.Mock;
  let service: PrioritySqsDispatchService;

  beforeEach(() => {
    sendPrioritisationMessage = jest.fn().mockResolvedValue("sqs-message-id");
    service = new PrioritySqsDispatchService({
      sendPrioritisationMessage,
    } as unknown as SqsService);
  });

  it("sends the ids-only message in its own FIFO group, deduplicated by run", async () => {
    await expect(service.dispatchBatch(MESSAGE)).resolves.toBe(
      "sqs-message-id",
    );
    expect(sendPrioritisationMessage).toHaveBeenCalledWith(
      MESSAGE,
      MESSAGE.analysisId,
      MESSAGE.analysisId,
    );
  });

  it("returns null instead of throwing when SQS rejects the send", async () => {
    sendPrioritisationMessage.mockRejectedValue(new Error("throttled"));
    await expect(service.dispatchBatch(MESSAGE)).resolves.toBeNull();
  });

  it("returns null when SQS returns no message id", async () => {
    sendPrioritisationMessage.mockResolvedValue(undefined);
    await expect(service.dispatchBatch(MESSAGE)).resolves.toBeNull();
  });
});
