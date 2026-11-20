import { InviteService } from "./invite.service";

describe("InviteService", () => {
  const send = jest.fn();
  let service: InviteService;

  beforeEach(() => {
    send.mockReset().mockResolvedValue({ MessageId: "m-1" });
    service = new InviteService({
      get: (key: string) =>
        key === "FRONTEND_URL" ? "https://app.example.test" : undefined,
    } as never);
    (service as unknown as { sesClient: { send: jest.Mock } }).sesClient = {
      send,
    };
  });

  const sentMessage = () => send.mock.calls[0][0].input.Message;

  it("escapes the inviter and organisation names in the HTML body", async () => {
    await service.sendInviteEmail(
      "invitee@example.com",
      "Sam <b>Admin</b>",
      '</strong><a href="https://elsewhere.test">Verify your account</a><strong>',
      "token-1",
    );

    const html: string = sentMessage().Body.Html.Data;
    expect(html).not.toContain('https://elsewhere.test">');
    expect(html).not.toContain("<b>Admin</b>");
    expect(html).toContain("Sam &lt;b&gt;Admin&lt;/b&gt;");
    expect(html).toContain("&lt;a href=&quot;https://elsewhere.test&quot;&gt;");
  });

  it("keeps the subject on one line", async () => {
    await service.sendInviteEmail(
      "invitee@example.com",
      "Sam\r\nBcc: other@example.com",
      "Acme",
      "token-1",
    );

    expect(sentMessage().Subject.Data).toBe(
      "Sam Bcc: other@example.com invited you to join Acme on BearlyMail",
    );
  });

  it("still sends ordinary names unchanged", async () => {
    await service.sendInviteEmail(
      "invitee@example.com",
      "Sam Admin",
      "Acme & Co",
      "token-1",
    );

    const message = sentMessage();
    expect(message.Subject.Data).toBe(
      "Sam Admin invited you to join Acme & Co on BearlyMail",
    );
    expect(message.Body.Html.Data).toContain("<strong>Acme &amp; Co</strong>");
    expect(message.Body.Html.Data).toContain(
      "https://app.example.test/accept-invite/token-1",
    );
  });
});
