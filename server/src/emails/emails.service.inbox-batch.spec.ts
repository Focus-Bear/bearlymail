import { EmailServiceDeps } from "./email-service-dependencies.provider";
import { EmailsService } from "./emails.service";

/**
 * getInboxBatch fans out to the per-category getInbox in parallel (issue #145).
 * These tests verify the aggregation, that each category keeps its own query
 * (and thus its own limit), and that one failing category doesn't fail the batch.
 */
describe("EmailsService.getInboxBatch", () => {
  const makeService = (getInbox: jest.Mock) => {
    const deps = {
      emailInboxService: { getInbox },
    } as unknown as EmailServiceDeps;
    return new EmailsService(deps);
  };

  it("returns one entry per key, calling getInbox once per category", async () => {
    const getInbox = jest.fn(async ({ filters }) => {
      const key = filters?.categoryIds?.[0];
      return { emails: [{ id: `${key}-1` }], total: 1, hasMore: false };
    });
    const service = makeService(getInbox);

    const result = await service.getInboxBatch("user-1", "triage", [
      "cat-a",
      "cat-b",
    ]);

    expect(getInbox).toHaveBeenCalledTimes(2);
    // Each call scopes to a single category, so each keeps its own result limit.
    expect(getInbox).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({ categoryIds: ["cat-a"] }),
      }),
    );
    expect(getInbox).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({ categoryIds: ["cat-b"] }),
      }),
    );
    expect(result.categories).toEqual([
      { key: "cat-a", emails: [{ id: "cat-a-1" }], total: 1, hasMore: false },
      { key: "cat-b", emails: [{ id: "cat-b-1" }], total: 1, hasMore: false },
    ]);
  });

  it("isolates a failing category — it returns empty instead of failing the batch", async () => {
    const getInbox = jest.fn(async ({ filters }) => {
      const key = filters?.categoryIds?.[0];
      if (key === "boom") {
        throw new Error("db down");
      }
      return { emails: [{ id: `${key}-1` }], total: 1, hasMore: false };
    });
    const service = makeService(getInbox);

    const result = await service.getInboxBatch("user-1", "triage", [
      "ok",
      "boom",
    ]);

    expect(result.categories).toEqual([
      { key: "ok", emails: [{ id: "ok-1" }], total: 1, hasMore: false },
      { key: "boom", emails: [], total: 0, hasMore: false },
    ]);
  });

  it("returns no categories and makes no query for an empty key list", async () => {
    const getInbox = jest.fn();
    const service = makeService(getInbox);

    const result = await service.getInboxBatch("user-1", "triage", []);

    expect(result.categories).toEqual([]);
    expect(getInbox).not.toHaveBeenCalled();
  });
});
