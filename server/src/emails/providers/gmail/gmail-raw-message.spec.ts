import { decodeGmailRawMessage } from "./gmail-raw-message";

const RFC822_MESSAGE = [
  "Received: from mail.example.com by mx.google.com",
  "DKIM-Signature: v=1; a=rsa-sha256; d=example.com; b=abc",
  "Message-ID: <abc123@example.com>",
  "From: Ana Müller <ana@example.com>",
  "To: bob@example.org",
  "Subject: =?UTF-8?Q?Caf=C3=A9?=",
  "Content-Type: text/plain; charset=ISO-8859-1",
  "Content-Transfer-Encoding: 8bit",
  "",
  "Body with an 8-bit byte: ",
].join("\r\n");
// Latin-1 "é" (0xE9) is not valid UTF-8 — it must survive as a raw byte.
const RAW_BYTES = Buffer.concat([
  Buffer.from(RFC822_MESSAGE, "utf8"),
  Buffer.from([0xe9]),
]);

describe("decodeGmailRawMessage", () => {
  it("decodes Gmail's base64url raw field back to the exact RFC 822 bytes", () => {
    const decoded = decodeGmailRawMessage(RAW_BYTES.toString("base64url"));
    expect(decoded.equals(RAW_BYTES)).toBe(true);
  });

  it("keeps every header, including transport and signature headers", () => {
    const text = decodeGmailRawMessage(
      RAW_BYTES.toString("base64url"),
    ).toString("latin1");
    expect(text).toContain("Received: from mail.example.com");
    expect(text).toContain("DKIM-Signature: v=1;");
    expect(text).toContain("Message-ID: <abc123@example.com>");
    expect(text).toContain("Subject: =?UTF-8?Q?Caf=C3=A9?=");
  });

  it("rejects an empty payload rather than producing an empty file", () => {
    expect(() => decodeGmailRawMessage("")).toThrow();
    expect(() => decodeGmailRawMessage(null)).toThrow();
    expect(() => decodeGmailRawMessage(undefined)).toThrow();
  });
});
