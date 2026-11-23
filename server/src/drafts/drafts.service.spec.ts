import { REPLY_DRAFT_SOURCES } from "../constants/domain-types";
import { ReplyDraft } from "../database/entities/reply-draft.entity";
import { DraftsService } from "./drafts.service";

describe("DraftsService.saveDraft", () => {
  const draftRepository = {
    findOne: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn((value) => Promise.resolve(value)),
  };
  const service = new DraftsService(draftRepository as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("marks a new draft as written by the user", async () => {
    draftRepository.findOne.mockResolvedValue(null);

    await service.saveDraft("user-1", "thread-1", "<p>Hi</p>");

    expect(draftRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ source: REPLY_DRAFT_SOURCES.USER }),
    );
  });

  it("hands an auto-responder draft over to the user once they save it, which clears its inbox badge", async () => {
    const autoDraft = {
      id: "draft-1",
      userId: "user-1",
      emailThreadId: "thread-1",
      content: "<p>Auto reply</p>",
      replyMode: "reply",
      recipients: "friend@example.com",
      source: REPLY_DRAFT_SOURCES.AUTO_RESPONDER,
    } as ReplyDraft;
    draftRepository.findOne.mockResolvedValue(autoDraft);

    await service.saveDraft(
      "user-1",
      "thread-1",
      "<p>Edited reply</p>",
      "reply",
      "friend@example.com",
    );

    expect(draftRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "draft-1",
        content: "<p>Edited reply</p>",
        source: REPLY_DRAFT_SOURCES.USER,
      }),
    );
  });
});

describe("DraftsService assistant drafts", () => {
  const draftRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn((value) => Promise.resolve(value)),
  };
  const service = new DraftsService(draftRepository as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("marks a prepared draft as the assistant's, so the inbox flags it and the user's edits take it over", async () => {
    await service.createAssistantDraft("user-1", null, {
      content: "<p>Hi</p>",
      recipients: "a@example.com",
      subject: "Order",
      cc: null,
      bcc: null,
      attachments: null,
    });

    expect(draftRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        emailThreadId: null,
        subject: "Order",
        source: REPLY_DRAFT_SOURCES.ASSISTANT,
      }),
    );
  });

  it("lists drafts newest first without loading attachment contents", async () => {
    draftRepository.find.mockResolvedValue([]);

    await service.listDraftSummaries("user-1", 10);

    const [options] = draftRepository.find.mock.calls[0];
    expect(options).toMatchObject({
      where: { userId: "user-1" },
      order: { updatedAt: "DESC" },
      take: 10,
    });
    expect(options.select.attachments).toBeUndefined();
    expect(options.select.content).toBe(true);
  });

  it("skips the attachment lookup when there are no drafts", async () => {
    await expect(
      service.findDraftIdsWithAttachments("user-1", []),
    ).resolves.toEqual(new Set());
    expect(draftRepository.find).not.toHaveBeenCalled();
  });
});
