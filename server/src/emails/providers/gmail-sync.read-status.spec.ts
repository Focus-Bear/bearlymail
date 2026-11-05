import type { gmail_v1 } from "googleapis";

import { GmailSyncService } from "./gmail-sync.service";

const READ_ONLY_SCOPES =
  "email profile https://www.googleapis.com/auth/gmail.readonly";
const MANAGE_SCOPES =
  "email profile https://www.googleapis.com/auth/gmail.modify";
const UNREAD_IN_GMAIL = ["INBOX", "UNREAD"];
const READ_IN_GMAIL = ["INBOX"];

function gmailMessage(labelIds: string[]): gmail_v1.Schema$Message {
  return {
    id: "gmail-1",
    threadId: "thread-1",
    labelIds,
    payload: {
      mimeType: "text/plain",
      headers: [{ name: "From", value: "sender@example.com" }],
      body: { data: "aGk=" },
    },
  };
}

async function syncOneMessage(options: {
  grantedScopes: string | null;
  storedIsRead: boolean;
  gmailLabels: string[];
}): Promise<jest.Mock> {
  const updateEmail = jest.fn();
  const service = Object.create(GmailSyncService.prototype) as {
    processThreadBatches: (...args: unknown[]) => Promise<unknown>;
    emailsService: unknown;
    usersService: unknown;
    logger: unknown;
  };
  service.emailsService = {
    getEmailByMessageId: jest.fn().mockResolvedValue({
      id: "email-1",
      isRead: options.storedIsRead,
      attachments: [],
    }),
    updateEmail,
  };
  service.usersService = {
    findOneWithTokens: jest
      .fn()
      .mockResolvedValue({ googleGrantedScopes: options.grantedScopes }),
  };
  service.logger = { debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const thread = { messages: [gmailMessage(options.gmailLabels)] };
  const gmail = {
    users: { threads: { get: jest.fn().mockResolvedValue({ data: thread }) } },
  };

  await service.processThreadBatches(
    "user-1",
    ["thread-1"],
    gmail,
    new Map(),
    false,
  );
  return updateEmail;
}

describe("GmailSyncService read status", () => {
  it("keeps an email read when a read-only grant left it unread in Gmail", async () => {
    const updateEmail = await syncOneMessage({
      grantedScopes: READ_ONLY_SCOPES,
      storedIsRead: true,
      gmailLabels: UNREAD_IN_GMAIL,
    });

    expect(updateEmail).not.toHaveBeenCalled();
  });

  it("marks an email read when it was read in Gmail, even on a read-only grant", async () => {
    const updateEmail = await syncOneMessage({
      grantedScopes: READ_ONLY_SCOPES,
      storedIsRead: false,
      gmailLabels: READ_IN_GMAIL,
    });

    expect(updateEmail).toHaveBeenCalledWith("user-1", "email-1", {
      isRead: true,
    });
  });

  it.each([
    ["a grant that can write to Gmail", MANAGE_SCOPES],
    ["a grant from before scopes were recorded", null],
  ])("still follows Gmail's unread for %s", async (_label, grantedScopes) => {
    const updateEmail = await syncOneMessage({
      grantedScopes,
      storedIsRead: true,
      gmailLabels: UNREAD_IN_GMAIL,
    });

    expect(updateEmail).toHaveBeenCalledWith("user-1", "email-1", {
      isRead: false,
    });
  });
});
