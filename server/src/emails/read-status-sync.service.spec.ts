import { Logger } from "@nestjs/common";

import { JOB_NAMES } from "../constants/job-names";
import { ReadStatusSyncService } from "./read-status-sync.service";

describe("ReadStatusSyncService", () => {
  const send = jest.fn();
  const boss = { send } as unknown as ConstructorParameters<
    typeof ReadStatusSyncService
  >[0];
  let service: ReadStatusSyncService;

  beforeEach(() => {
    jest.clearAllMocks();
    send.mockResolvedValue("job-id");
    service = new ReadStatusSyncService(boss);
  });

  it("queues one provider sync job per distinct email", () => {
    service.queueProviderSync("user-1", ["email-1", "email-2", "email-1"]);

    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledWith(
      JOB_NAMES.READ_STATUS_PROVIDER_SYNC,
      { userId: "user-1", emailId: "email-1" },
      expect.objectContaining({ priority: expect.any(Number) }),
    );
    expect(send).toHaveBeenCalledWith(
      JOB_NAMES.READ_STATUS_PROVIDER_SYNC,
      { userId: "user-1", emailId: "email-2" },
      expect.any(Object),
    );
  });

  it("swallows and logs a queue failure instead of throwing", async () => {
    const warn = jest
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);
    send.mockRejectedValueOnce(new Error("boss down"));

    expect(() =>
      service.queueProviderSync("user-1", ["email-1"]),
    ).not.toThrow();
    await new Promise(setImmediate);

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("emailId=email-1"),
    );
    warn.mockRestore();
  });
});
