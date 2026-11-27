import type { ZohoProvider } from "../zoho.provider";
import { sendReply } from "./zoho-actions.service";
import { sendReplyViaZoho } from "./zoho-operations";

jest.mock("./zoho-operations", () => ({
  ...jest.requireActual("./zoho-operations"),
  sendReplyViaZoho: jest.fn().mockResolvedValue({ messageId: "m-1" }),
}));

const providerWithThread = (messageIds: string[]): ZohoProvider =>
  ({
    logger: { log: jest.fn(), error: jest.fn() },
    zohoAccountsService: {
      findPrimary: jest.fn().mockResolvedValue({
        id: "acc-row",
        accessToken: "test-token",
        accountsServer: null,
      }),
    },
    client: {
      createZohoClient: jest.fn().mockReturnValue({}),
      getAccountId: jest.fn().mockResolvedValue({
        zohoAccountId: "acc-1",
        mailboxAddress: "me@zoho.com",
      }),
    },
    emailsService: {
      getThreadEmails: jest
        .fn()
        .mockResolvedValue(messageIds.map((messageId) => ({ messageId }))),
    },
  }) as unknown as ZohoProvider;

const REPLY = {
  threadId: "t-1",
  to: "friend@example.com",
  subject: "Re: Hi",
  body: "Hello",
  options: { htmlBody: "<p>Hello</p>" },
};

describe("Zoho sendReply (#515)", () => {
  it("replies from the mailbox to the newest message Zoho knows", async () => {
    const result = await sendReply(
      providerWithThread(["zoho-1795000000000", "222", "111"]),
      "user-1",
      REPLY,
    );

    expect(sendReplyViaZoho).toHaveBeenLastCalledWith(
      {},
      "acc-1",
      "me@zoho.com",
      expect.objectContaining({
        replyToMessageId: "222",
        htmlBody: "<p>Hello</p>",
      }),
    );
    expect(result).toEqual({ messageId: "m-1", threadId: "t-1" });
  });

  it("logs why Zoho refused a reply, without the message text", async () => {
    (sendReplyViaZoho as jest.Mock).mockRejectedValueOnce(
      new Error("Request failed with status code 400"),
    );
    const provider = providerWithThread(["222"]);

    await expect(sendReply(provider, "user-1", REPLY)).rejects.toThrow();

    const logged = (provider.logger.error as jest.Mock).mock.calls[0][0];
    expect(logged).toContain("status code 400");
    expect(logged).not.toContain("Hello");
  });

  it("passes no message id when the thread has none", async () => {
    await sendReply(providerWithThread([]), "user-1", REPLY);

    expect(sendReplyViaZoho).toHaveBeenLastCalledWith(
      {},
      "acc-1",
      "me@zoho.com",
      expect.objectContaining({ replyToMessageId: undefined }),
    );
  });
});
