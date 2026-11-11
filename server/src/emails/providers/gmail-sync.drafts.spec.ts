import { gmail_v1 } from "googleapis";
import type { PgBoss } from "pg-boss";

import { UsersService } from "../../users/users.service";
import { CreateEmailOptions } from "../email-lifecycle.service";
import { EmailsService } from "../emails.service";
import { ScanEmailService } from "../scan-email.service";
import { SyncHistoryService } from "../sync-history.service";
import { GmailProvider } from "./gmail.provider";
import { GmailSyncService } from "./gmail-sync.service";

interface ProcessMessageAccess {
  processMessage(
    userId: string,
    message: gmail_v1.Schema$Message,
    starCount: number,
    createEmailOptions: CreateEmailOptions,
  ): Promise<void>;
}

const USER_ID = "user-1";
const SYNC_OPTIONS: CreateEmailOptions = {};

function gmailMessage(id: string, labelIds: string[]): gmail_v1.Schema$Message {
  return {
    id,
    threadId: "thread-1",
    labelIds,
    internalDate: "1700000000000",
    payload: {
      headers: [
        { name: "From", value: "Me <me@example.com>" },
        { name: "To", value: "client@example.com" },
        { name: "Subject", value: "Re: Proposal" },
      ],
      mimeType: "text/plain",
      body: { data: Buffer.from("Draft reply").toString("base64") },
    },
  };
}

describe("GmailSyncService — Gmail drafts are never synced as mail", () => {
  let emailsService: jest.Mocked<
    Pick<
      EmailsService,
      | "createEmail"
      | "getEmailByMessageId"
      | "updateEmail"
      | "deleteEmailByMessageId"
    >
  >;
  let syncService: ProcessMessageAccess;

  beforeEach(() => {
    emailsService = {
      createEmail: jest.fn(),
      getEmailByMessageId: jest.fn().mockResolvedValue(null),
      updateEmail: jest.fn(),
      deleteEmailByMessageId: jest.fn().mockResolvedValue(false),
    };
    syncService = new GmailSyncService(
      {} as UsersService,
      emailsService as unknown as EmailsService,
      {} as ScanEmailService,
      {} as PgBoss,
      {} as SyncHistoryService,
      {} as GmailProvider,
    ) as unknown as ProcessMessageAccess;
  });

  it("does not store an unsent draft found in a synced thread", async () => {
    await syncService.processMessage(
      USER_ID,
      gmailMessage("draft-1", ["DRAFT"]),
      0,
      SYNC_OPTIONS,
    );

    expect(emailsService.createEmail).not.toHaveBeenCalled();
  });

  it("removes a copy of the draft stored by an older sync", async () => {
    await syncService.processMessage(
      USER_ID,
      gmailMessage("draft-1", ["DRAFT"]),
      0,
      SYNC_OPTIONS,
    );

    expect(emailsService.deleteEmailByMessageId).toHaveBeenCalledWith(
      USER_ID,
      "draft-1",
    );
  });

  it("still stores a sent reply with its labels", async () => {
    await syncService.processMessage(
      USER_ID,
      gmailMessage("sent-1", ["SENT"]),
      0,
      SYNC_OPTIONS,
    );

    expect(emailsService.deleteEmailByMessageId).not.toHaveBeenCalled();
    expect(emailsService.createEmail).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ messageId: "sent-1", labels: ["SENT"] }),
      SYNC_OPTIONS,
    );
  });

  it("un-hides a stored draft once Gmail sends it under the same ID", async () => {
    emailsService.getEmailByMessageId.mockResolvedValue({
      id: "row-1",
      isRead: true,
      attachments: null,
      labels: ["DRAFT"],
    } as unknown as Awaited<ReturnType<EmailsService["getEmailByMessageId"]>>);

    await syncService.processMessage(
      USER_ID,
      gmailMessage("msg-1", ["SENT"]),
      0,
      SYNC_OPTIONS,
    );

    expect(emailsService.updateEmail).toHaveBeenCalledWith(USER_ID, "row-1", {
      labels: ["SENT"],
    });
    expect(emailsService.createEmail).not.toHaveBeenCalled();
  });
});
