import { composeMessage } from "./smtp-sender";

describe("composeMessage", () => {
  it("threads a reply and keeps Bcc out of the headers but in the envelope", async () => {
    const composed = await composeMessage({
      from: { email: "friend@crazy.test", name: "Friend" },
      to: ["Billing <billing@supplier.test>, accounts@supplier.test"],
      cc: ["boss@crazy.test"],
      bcc: ["archive@crazy.test"],
      subject: "Re: Invoice",
      text: "Paying this week.",
      inReplyTo: "invoice@supplier.test",
      references: ["root@supplier.test", "invoice@supplier.test"],
    });
    const raw = composed.raw.toString();

    expect(composed.messageId).toMatch(/@crazy\.test$/);
    expect(raw).toContain(`Message-ID: <${composed.messageId}>`);
    expect(raw).toContain("In-Reply-To: <invoice@supplier.test>");
    expect(raw).toContain(
      "References: <root@supplier.test> <invoice@supplier.test>",
    );
    expect(raw).toContain("From: Friend <friend@crazy.test>");
    expect(raw).not.toContain("archive@crazy.test");
    expect(composed.recipients).toEqual([
      "billing@supplier.test",
      "accounts@supplier.test",
      "boss@crazy.test",
      "archive@crazy.test",
    ]);
  });
});
