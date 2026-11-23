import { REPLY_DRAFT_SOURCES } from "../constants/domain-types";
import { MCP_DRAFTS } from "../constants/mcp-server.constants";
import { ReplyDraft } from "../database/entities/reply-draft.entity";
import { DraftsService } from "../drafts/drafts.service";
import { EmailsService } from "../emails/emails.service";
import { McpDraftToolsService } from "./mcp-draft-tools.service";
import { McpToolInputError } from "./mcp-tool-args";

const USER_ID = "user-1";
const EMAIL_ID = "22222222-2222-4222-8222-222222222222";
const DRAFT_ID = "33333333-3333-4333-8333-333333333333";
const LATEST_EMAIL_ID = "44444444-4444-4444-8444-444444444444";
const THREAD_ID = "provider-thread-1";
const FRONTEND = "https://app.example.com";
const PDF_BASE64 = Buffer.from("%PDF-1.4 quote").toString("base64");

const QUOTE_PDF = {
  filename: "quote.pdf",
  mimeType: "application/pdf",
  contentBase64: PDF_BASE64,
};

function assistantDraft(overrides: Partial<ReplyDraft> = {}): ReplyDraft {
  return {
    id: DRAFT_ID,
    userId: USER_ID,
    emailThreadId: null,
    content: "<p>Hello</p>",
    replyMode: "reply",
    recipients: "supplier@example.com",
    subject: "Order",
    cc: null,
    bcc: null,
    attachments: null,
    source: REPLY_DRAFT_SOURCES.ASSISTANT,
    createdAt: new Date("2026-11-18T00:00:00Z"),
    updatedAt: new Date("2026-11-18T01:00:00Z"),
    ...overrides,
  } as ReplyDraft;
}

describe("McpDraftToolsService", () => {
  const originalFrontendUrl = process.env.FRONTEND_URL;
  let draftsService: jest.Mocked<
    Pick<
      DraftsService,
      | "getDraftByThread"
      | "getDraftById"
      | "createAssistantDraft"
      | "updateAssistantDraft"
      | "listDraftSummaries"
      | "findDraftIdsWithAttachments"
      | "deleteDraftById"
    >
  >;
  let emailsService: { getEmailById: jest.Mock; getThreadEmails: jest.Mock };
  let service: McpDraftToolsService;

  beforeAll(() => {
    process.env.FRONTEND_URL = `${FRONTEND}/`;
  });

  afterAll(() => {
    process.env.FRONTEND_URL = originalFrontendUrl;
  });

  beforeEach(() => {
    draftsService = {
      getDraftByThread: jest.fn().mockResolvedValue(null),
      getDraftById: jest.fn().mockResolvedValue(assistantDraft()),
      createAssistantDraft: jest.fn(
        async (userId, emailThreadId, fields) =>
          ({
            ...assistantDraft(),
            userId,
            emailThreadId,
            ...fields,
          }) as ReplyDraft,
      ),
      updateAssistantDraft: jest.fn(
        async (draft, changes) => ({ ...draft, ...changes }) as ReplyDraft,
      ),
      listDraftSummaries: jest.fn().mockResolvedValue([]),
      findDraftIdsWithAttachments: jest.fn().mockResolvedValue(new Set()),
      deleteDraftById: jest.fn().mockResolvedValue(undefined),
    };
    emailsService = {
      getEmailById: jest.fn().mockResolvedValue({
        id: EMAIL_ID,
        threadId: THREAD_ID,
        from: "sender@example.com",
        replyTo: "replies@example.com",
      }),
      getThreadEmails: jest.fn().mockResolvedValue([{ id: LATEST_EMAIL_ID }]),
    };
    service = new McpDraftToolsService(
      draftsService as unknown as DraftsService,
      emailsService as unknown as EmailsService,
    );
  });

  describe("createDraft — new message", () => {
    it("saves a new-message draft with recipients, HTML body and attachments, and links to Compose", async () => {
      const result = await service.createDraft(USER_ID, {
        to: ["supplier@example.com", "sales@example.com"],
        cc: ["me@example.com"],
        bcc: ["archive@example.com"],
        subject: "Purchase order 42",
        body: "Hi,\n\nPlease find the PO attached.\nThanks",
        attachments: [QUOTE_PDF],
      });

      expect(draftsService.createAssistantDraft).toHaveBeenCalledWith(
        USER_ID,
        null,
        {
          content: "<p>Hi,</p><p>Please find the PO attached.<br>Thanks</p>",
          recipients: "supplier@example.com, sales@example.com",
          cc: "me@example.com",
          bcc: "archive@example.com",
          subject: "Purchase order 42",
          attachments: [
            {
              filename: "quote.pdf",
              mimeType: "application/pdf",
              content: PDF_BASE64,
            },
          ],
        },
      );
      expect(result).toMatchObject({
        draftId: DRAFT_ID,
        kind: "new",
        url: `${FRONTEND}${MCP_DRAFTS.COMPOSE_PATH}?${MCP_DRAFTS.COMPOSE_DRAFT_PARAM}=${DRAFT_ID}`,
        attachments: ["quote.pdf"],
      });
      expect(result.note).toMatch(/Nothing was sent/);
    });

    it("needs a recipient and a subject for a new message", async () => {
      await expect(
        service.createDraft(USER_ID, { subject: "Hi", body: "Hello" }),
      ).rejects.toThrow(/`to` needs at least one/);
      await expect(
        service.createDraft(USER_ID, {
          to: ["a@example.com"],
          body: "Hello",
        }),
      ).rejects.toThrow(/`subject` is required/);
      expect(draftsService.createAssistantDraft).not.toHaveBeenCalled();
    });

    it("rejects invalid recipient addresses", async () => {
      await expect(
        service.createDraft(USER_ID, {
          to: ["not-an-address"],
          subject: "Hi",
          body: "Hello",
        }),
      ).rejects.toBeInstanceOf(McpToolInputError);
    });
  });

  describe("createDraft — reply", () => {
    it("threads the draft onto the replied-to email and addresses it like send_reply would", async () => {
      const result = await service.createDraft(USER_ID, {
        replyToEmailId: EMAIL_ID,
        body: "Thanks, confirmed.",
      });

      expect(emailsService.getEmailById).toHaveBeenCalledWith(
        USER_ID,
        EMAIL_ID,
      );
      expect(draftsService.createAssistantDraft).toHaveBeenCalledWith(
        USER_ID,
        THREAD_ID,
        expect.objectContaining({
          recipients: "replies@example.com",
          subject: null,
          content: "<p>Thanks, confirmed.</p>",
        }),
      );
      expect(result).toMatchObject({
        kind: "reply",
        threadId: THREAD_ID,
        url: `${FRONTEND}${MCP_DRAFTS.EMAIL_DETAIL_PATH}/${EMAIL_ID}`,
      });
    });

    it("falls back to the sender without a Reply-To, and honours explicit recipients", async () => {
      emailsService.getEmailById.mockResolvedValue({
        id: EMAIL_ID,
        threadId: THREAD_ID,
        from: "sender@example.com",
        replyTo: null,
      });
      await service.createDraft(USER_ID, {
        replyToEmailId: EMAIL_ID,
        body: "Hi",
      });
      await service.createDraft(USER_ID, {
        replyToEmailId: EMAIL_ID,
        to: ["other@example.com"],
        subject: "Re: Order — updated",
        body: "Hi",
        attachments: [QUOTE_PDF],
      });

      expect(draftsService.createAssistantDraft).toHaveBeenNthCalledWith(
        1,
        USER_ID,
        THREAD_ID,
        expect.objectContaining({ recipients: "sender@example.com" }),
      );
      expect(draftsService.createAssistantDraft).toHaveBeenNthCalledWith(
        2,
        USER_ID,
        THREAD_ID,
        expect.objectContaining({
          recipients: "other@example.com",
          subject: "Re: Order — updated",
          attachments: [expect.objectContaining({ filename: "quote.pdf" })],
        }),
      );
    });

    it("never overwrites the user's own draft on the thread", async () => {
      draftsService.getDraftByThread.mockResolvedValue(
        assistantDraft({
          emailThreadId: THREAD_ID,
          source: REPLY_DRAFT_SOURCES.USER,
        }),
      );
      await expect(
        service.createDraft(USER_ID, { replyToEmailId: EMAIL_ID, body: "Hi" }),
      ).rejects.toThrow(/already has a reply draft/);
      expect(draftsService.createAssistantDraft).not.toHaveBeenCalled();
    });

    it("points at update_draft when the assistant already drafted on the thread", async () => {
      draftsService.getDraftByThread.mockResolvedValue(
        assistantDraft({ emailThreadId: THREAD_ID }),
      );
      await expect(
        service.createDraft(USER_ID, { replyToEmailId: EMAIL_ID, body: "Hi" }),
      ).rejects.toThrow(new RegExp(`${DRAFT_ID}.*update_draft`));
    });

    it("rejects an unknown or malformed email id", async () => {
      emailsService.getEmailById.mockResolvedValue(null);
      await expect(
        service.createDraft(USER_ID, { replyToEmailId: EMAIL_ID, body: "Hi" }),
      ).rejects.toThrow(/No email found/);
      await expect(
        service.createDraft(USER_ID, { replyToEmailId: "abc", body: "Hi" }),
      ).rejects.toThrow(/BearlyMail id/);
    });
  });

  describe("updateDraft", () => {
    it("changes only the fields passed", async () => {
      const result = await service.updateDraft(USER_ID, {
        draftId: DRAFT_ID,
        subject: "Purchase order 43",
      });

      expect(draftsService.updateAssistantDraft).toHaveBeenCalledWith(
        expect.objectContaining({ id: DRAFT_ID }),
        { subject: "Purchase order 43" },
      );
      expect(result).toMatchObject({ subject: "Purchase order 43" });
    });

    it("clears Cc and attachments when given empty lists", async () => {
      await service.updateDraft(USER_ID, {
        draftId: DRAFT_ID,
        cc: [],
        attachments: [],
      });
      expect(draftsService.updateAssistantDraft).toHaveBeenCalledWith(
        expect.anything(),
        { cc: null, attachments: null },
      );
    });

    it("refuses to empty the To list or to change nothing", async () => {
      await expect(
        service.updateDraft(USER_ID, { draftId: DRAFT_ID, to: [] }),
      ).rejects.toThrow(/`to` needs at least one/);
      await expect(
        service.updateDraft(USER_ID, { draftId: DRAFT_ID }),
      ).rejects.toThrow(/at least one of/);
      expect(draftsService.updateAssistantDraft).not.toHaveBeenCalled();
    });

    it("can't touch a draft the user wrote or edited", async () => {
      draftsService.getDraftById.mockResolvedValue(
        assistantDraft({ source: REPLY_DRAFT_SOURCES.USER }),
      );
      await expect(
        service.updateDraft(USER_ID, { draftId: DRAFT_ID, body: "Changed" }),
      ).rejects.toThrow(/written or edited by the user/);
      expect(draftsService.updateAssistantDraft).not.toHaveBeenCalled();
    });

    it("links a reply draft to the newest email in its thread", async () => {
      draftsService.getDraftById.mockResolvedValue(
        assistantDraft({ emailThreadId: THREAD_ID }),
      );
      const result = await service.updateDraft(USER_ID, {
        draftId: DRAFT_ID,
        body: "Changed",
      });
      expect(result.url).toBe(
        `${FRONTEND}${MCP_DRAFTS.EMAIL_DETAIL_PATH}/${LATEST_EMAIL_ID}`,
      );
    });
  });

  describe("deleteDraft", () => {
    it("deletes the assistant's own draft", async () => {
      await expect(
        service.deleteDraft(USER_ID, { draftId: DRAFT_ID }),
      ).resolves.toEqual({ draftId: DRAFT_ID, deleted: true });
      expect(draftsService.deleteDraftById).toHaveBeenCalledWith(
        USER_ID,
        DRAFT_ID,
      );
    });

    it("refuses a missing draft or one the user wrote", async () => {
      draftsService.getDraftById.mockResolvedValueOnce(null);
      await expect(
        service.deleteDraft(USER_ID, { draftId: DRAFT_ID }),
      ).rejects.toThrow(/No draft found/);
      draftsService.getDraftById.mockResolvedValueOnce(
        assistantDraft({ source: REPLY_DRAFT_SOURCES.AUTO_RESPONDER }),
      );
      await expect(
        service.deleteDraft(USER_ID, { draftId: DRAFT_ID }),
      ).rejects.toThrow(/written or edited by the user/);
      expect(draftsService.deleteDraftById).not.toHaveBeenCalled();
    });
  });

  describe("listDrafts", () => {
    it("lists every draft with links, a text body and who can edit it, without attachment contents", async () => {
      const userReply = assistantDraft({
        id: "55555555-5555-4555-8555-555555555555",
        emailThreadId: THREAD_ID,
        content: "<p>My <b>own</b> reply</p>",
        subject: null,
        source: REPLY_DRAFT_SOURCES.USER,
      });
      draftsService.listDraftSummaries.mockResolvedValue([
        assistantDraft(),
        userReply,
      ]);
      draftsService.findDraftIdsWithAttachments.mockResolvedValue(
        new Set([DRAFT_ID]),
      );

      const { drafts } = await service.listDrafts(USER_ID, { limit: 5 });

      expect(draftsService.listDraftSummaries).toHaveBeenCalledWith(USER_ID, 5);
      expect(drafts).toEqual([
        expect.objectContaining({
          draftId: DRAFT_ID,
          kind: "new",
          hasAttachments: true,
          isEditableByAssistant: true,
          body: "Hello",
          url: `${FRONTEND}${MCP_DRAFTS.COMPOSE_PATH}?${MCP_DRAFTS.COMPOSE_DRAFT_PARAM}=${DRAFT_ID}`,
        }),
        expect.objectContaining({
          kind: "reply",
          hasAttachments: false,
          isEditableByAssistant: false,
          writtenBy: REPLY_DRAFT_SOURCES.USER,
          body: "My own reply",
          url: `${FRONTEND}${MCP_DRAFTS.EMAIL_DETAIL_PATH}/${LATEST_EMAIL_ID}`,
        }),
      ]);
    });
  });
});
