import { EmailReadService } from "./email-read.service";

function queryBuilderMock() {
  const builder = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  return builder;
}

function setup() {
  const builder = queryBuilderMock();
  const repository = {
    createQueryBuilder: jest.fn(() => builder),
    update: jest.fn(),
  };
  return {
    builder,
    repository,
    service: new EmailReadService(repository as never),
  };
}

describe("EmailReadService engagement signals", () => {
  it("markAsRead stamps the first open without overwriting an earlier one", async () => {
    const { builder, service } = setup();
    const getEmailById = jest.fn().mockResolvedValue({ id: "e1" });

    await service.markAsRead("u1", "e1", getEmailById);

    const values = builder.set.mock.calls[0][0];
    expect(values.isRead).toBe(true);
    expect(values.openedAt()).toBe('COALESCE("openedAt", now())');
    expect(builder.where).toHaveBeenCalledWith("id = :emailId", {
      emailId: "e1",
    });
    expect(builder.andWhere).toHaveBeenCalledWith('"userId" = :userId', {
      userId: "u1",
    });
    expect(getEmailById).toHaveBeenCalledWith("u1", "e1");
  });

  it("recordUserArchive keeps 'archived while unread' and only stamps the first archive", async () => {
    const { builder, service } = setup();

    await service.recordUserArchive("u1", ["t1", "t2"]);

    const values = builder.set.mock.calls[0][0];
    expect(values.archivedAt()).toBe("now()");
    expect(values.archivedWhileUnread()).toBe(
      '("isRead" = false AND "openedAt" IS NULL)',
    );
    expect(builder.andWhere).toHaveBeenCalledWith(
      '"threadId" IN (:...threadIds)',
      {
        threadIds: ["t1", "t2"],
      },
    );
    expect(builder.andWhere).toHaveBeenCalledWith('"archivedAt" IS NULL');
  });

  it("recordUserArchive does nothing for no threads", async () => {
    const { repository, service } = setup();
    await service.recordUserArchive("u1", []);
    expect(repository.createQueryBuilder).not.toHaveBeenCalled();
  });
});
