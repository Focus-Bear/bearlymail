import { buildEmailContent } from "./gmail-send";

const base = {
  to: [{ email: "to@example.com" }],
  subject: "Files",
  body: "See attached",
};

describe("buildEmailContent attachment headers", () => {
  it("keeps an ordinary attachment name and type", () => {
    const raw = buildEmailContent({
      ...base,
      attachments: [
        {
          filename: "report.pdf",
          mimeType: "application/pdf",
          content: Buffer.from("x"),
        },
      ],
    });

    expect(raw).toContain('Content-Type: application/pdf; name="report.pdf"');
    expect(raw).toContain(
      'Content-Disposition: attachment; filename="report.pdf"',
    );
  });

  it("keeps quotes and line breaks in a filename inside the header value", () => {
    const raw = buildEmailContent({
      ...base,
      attachments: [
        {
          filename: 'a"\r\nX-Injected: yes\r\n\r\nbody.pdf',
          mimeType: "application/pdf",
          content: Buffer.from("x"),
        },
      ],
    });

    expect(raw).not.toMatch(/^X-Injected:/m);
    expect(raw).toContain('filename="a_X-Injected: yes_body.pdf"');
  });

  it("replaces a malformed type with the generic binary type", () => {
    const raw = buildEmailContent({
      ...base,
      attachments: [
        {
          filename: "a.bin",
          mimeType: 'text/html"\r\nX-Injected: yes',
          content: Buffer.from("x"),
        },
      ],
    });

    expect(raw).not.toMatch(/^X-Injected:/m);
    expect(raw).toContain(
      'Content-Type: application/octet-stream; name="a.bin"',
    );
  });

  it("strips angle brackets and line breaks from an inline image's content id", () => {
    const raw = buildEmailContent({
      ...base,
      htmlBody: '<img src="cid:logo">',
      attachments: [
        {
          filename: "logo.png",
          mimeType: "image/png",
          content: Buffer.from("x"),
          contentId: "logo>\r\nX-Injected: yes",
        },
      ],
    });

    expect(raw).not.toMatch(/^X-Injected:/m);
  });
});
