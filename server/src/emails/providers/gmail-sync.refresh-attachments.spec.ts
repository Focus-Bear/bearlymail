import { BadRequestException, Logger, NotFoundException } from "@nestjs/common";

import { Email } from "../../database/entities/email.entity";
import { EmailAttachment } from "../interfaces/email-provider.interface";
import { refreshAttachmentsFromGmailForThread } from "./gmail-sync.refresh-attachments";

describe("refreshAttachmentsFromGmailForThread", () => {
  const userId = "user-123";
  const emailId = "email-uuid-abc";
  /* provider thread ID (hex string) */
  const gmailThreadId = "19d448f4b9ec4d74";
  /* internal FK UUID */
  const internalThreadUuid = "internal-thread-uuid-456";

  const mockLogger = {
    warn: jest.fn(),
    log: jest.fn(),
    error: jest.fn(),
  } as unknown as Logger;

  const makeEmail = (overrides: Partial<Email> = {}): Email =>
    ({
      id: emailId,
      userId,
      threadId: gmailThreadId,
      emailThreadId: internalThreadUuid,
      messageId: "msg-id-1",
      ...overrides,
    }) as Email;

  const makeThreadEmail = (id: string, messageId: string): Email =>
    ({
      id,
      userId,
      threadId: gmailThreadId,
      emailThreadId: internalThreadUuid,
      messageId,
    }) as Email;

  const makeAttachment = (): EmailAttachment => ({
    attachmentId: "att-id",
    filename: "file.pdf",
    mimeType: "application/pdf",
    size: 1024,
  });

  let mockEmailsService: {
    getEmailById: jest.Mock;
    getThreadEmails: jest.Mock;
    updateEmail: jest.Mock;
  };

  let mockGmailProvider: {
    createGmailClientPublic: jest.Mock;
  };

  let mockGmailClient: {
    users: {
      messages: {
        get: jest.Mock;
      };
    };
  };

  beforeEach(() => {
    mockGmailClient = {
      users: {
        messages: {
          get: jest.fn(),
        },
      },
    };

    mockGmailProvider = {
      createGmailClientPublic: jest.fn().mockResolvedValue(mockGmailClient),
    };

    mockEmailsService = {
      getEmailById: jest.fn(),
      getThreadEmails: jest.fn(),
      updateEmail: jest.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should use threadId (Gmail thread ID) not emailThreadId (internal UUID) to fetch thread emails", async () => {
    /* This is the core regression test for the bug: emailThreadId (UUID) was passed to getThreadEmails() which filters on the threadId column (hex string). */
    const triggerEmail = makeEmail();
    mockEmailsService.getEmailById.mockResolvedValue(triggerEmail);
    mockEmailsService.getThreadEmails.mockResolvedValue([triggerEmail]);

    const attachment = makeAttachment();
    mockGmailClient.users.messages.get.mockResolvedValue({
      data: {
        id: "msg-id-1",
        payload: {
          parts: [
            {
              filename: attachment.filename,
              mimeType: attachment.mimeType,
              body: { attachmentId: attachment.attachmentId, size: attachment.size },
            },
          ],
        },
      },
    });

    await refreshAttachmentsFromGmailForThread(
      {
        emailsService: mockEmailsService as any,
        gmailProvider: mockGmailProvider as any,
        logger: mockLogger,
      },
      userId,
      emailId,
    );

    /* Must use Gmail thread ID (threadId), NOT the internal UUID (emailThreadId) */
    expect(mockEmailsService.getThreadEmails).toHaveBeenCalledWith(
      userId,
      gmailThreadId,
    );
    expect(mockEmailsService.getThreadEmails).not.toHaveBeenCalledWith(
      userId,
      internalThreadUuid,
    );
  });

  it("should return threadId as Gmail thread ID in response", async () => {
    const triggerEmail = makeEmail();
    mockEmailsService.getEmailById.mockResolvedValue(triggerEmail);
    mockEmailsService.getThreadEmails.mockResolvedValue([triggerEmail]);
    mockGmailClient.users.messages.get.mockResolvedValue({
      data: { id: "msg-id-1", payload: { parts: [] } },
    });

    const result = await refreshAttachmentsFromGmailForThread(
      {
        emailsService: mockEmailsService as any,
        gmailProvider: mockGmailProvider as any,
        logger: mockLogger,
      },
      userId,
      emailId,
    );

    expect(result.threadId).toBe(gmailThreadId);
    expect(result.threadId).not.toBe(internalThreadUuid);
  });

  it("should refresh attachments for all emails in the thread", async () => {
    const email1 = makeThreadEmail("email-1", "msg-1");
    const email2 = makeThreadEmail("email-2", "msg-2");
    mockEmailsService.getEmailById.mockResolvedValue(email1);
    mockEmailsService.getThreadEmails.mockResolvedValue([email1, email2]);

    const attachment = makeAttachment();
    mockGmailClient.users.messages.get.mockResolvedValue({
      data: {
        id: "msg-1",
        payload: {
          parts: [
            {
              filename: attachment.filename,
              mimeType: attachment.mimeType,
              body: { attachmentId: attachment.attachmentId, size: attachment.size },
            },
          ],
        },
      },
    });

    const result = await refreshAttachmentsFromGmailForThread(
      {
        emailsService: mockEmailsService as any,
        gmailProvider: mockGmailProvider as any,
        logger: mockLogger,
      },
      userId,
      "email-1",
    );

    expect(result.results).toHaveLength(2);
    expect(mockEmailsService.updateEmail).toHaveBeenCalledTimes(2);
    expect(mockEmailsService.updateEmail).toHaveBeenCalledWith(
      userId,
      "email-1",
      expect.any(Object),
    );
    expect(mockEmailsService.updateEmail).toHaveBeenCalledWith(
      userId,
      "email-2",
      expect.any(Object),
    );
  });

  it("should throw NotFoundException when trigger email is not found", async () => {
    mockEmailsService.getEmailById.mockResolvedValue(null);

    await expect(
      refreshAttachmentsFromGmailForThread(
        {
          emailsService: mockEmailsService as any,
          gmailProvider: mockGmailProvider as any,
          logger: mockLogger,
        },
        userId,
        emailId,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it("should throw BadRequestException when email has no emailThreadId", async () => {
    const emailWithoutThread = makeEmail({ emailThreadId: null as any });
    mockEmailsService.getEmailById.mockResolvedValue(emailWithoutThread);

    await expect(
      refreshAttachmentsFromGmailForThread(
        {
          emailsService: mockEmailsService as any,
          gmailProvider: mockGmailProvider as any,
          logger: mockLogger,
        },
        userId,
        emailId,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("should record an error result when Gmail API fails for an email", async () => {
    const triggerEmail = makeEmail();
    mockEmailsService.getEmailById.mockResolvedValue(triggerEmail);
    mockEmailsService.getThreadEmails.mockResolvedValue([triggerEmail]);
    mockGmailClient.users.messages.get.mockRejectedValue(
      new Error("Gmail API error"),
    );

    const result = await refreshAttachmentsFromGmailForThread(
      {
        emailsService: mockEmailsService as any,
        gmailProvider: mockGmailProvider as any,
        logger: mockLogger,
      },
      userId,
      emailId,
    );

    expect(result.results[0].error).toBeDefined();
    expect(mockEmailsService.updateEmail).not.toHaveBeenCalled();
  });
});
