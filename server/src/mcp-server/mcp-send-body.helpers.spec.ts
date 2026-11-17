import { toSendableHtmlBody } from "./mcp-send-body.helpers";

describe("toSendableHtmlBody", () => {
  it("turns blank-line-separated blocks into paragraphs", () => {
    expect(toSendableHtmlBody("Hello,\n\nFirst point.\n\nThanks")).toBe(
      "<p>Hello,</p><p>First point.</p><p>Thanks</p>",
    );
  });

  it("keeps single newlines as line breaks", () => {
    expect(toSendableHtmlBody("Best,\nAndrea\nFocus Bear Team")).toBe(
      "<p>Best,<br>Andrea<br>Focus Bear Team</p>",
    );
  });

  it("normalises Windows line endings and extra blank lines", () => {
    expect(toSendableHtmlBody("\r\nOne\r\n\r\n\r\n  \r\nTwo\r\n")).toBe(
      "<p>One</p><p>Two</p>",
    );
  });

  it("escapes characters that would otherwise be read as markup", () => {
    expect(toSendableHtmlBody('Q&A: is 3 < 5 & "yes"?')).toBe(
      "<p>Q&amp;A: is 3 &lt; 5 &amp; &quot;yes&quot;?</p>",
    );
  });

  it("leaves a body that is already HTML untouched", () => {
    const html = "<p>Hi <strong>there</strong></p>";
    expect(toSendableHtmlBody(html)).toBe(html);
  });

  it.each([
    '<a href="https://focusbear.io">Focus Bear</a>',
    "Line one<br/>Line two",
    "<div>Hi</div>",
    "<b>Bold</b> text",
  ])("treats real HTML tags as HTML (%s)", (html) => {
    expect(toSendableHtmlBody(html)).toBe(html);
  });

  it.each([
    [
      "Email me at <jane@example.com>\nThanks",
      "<p>Email me at &lt;jane@example.com&gt;<br>Thanks</p>",
    ],
    [
      "Docs: <https://focusbear.io/docs>\n\nCheers",
      "<p>Docs: &lt;https://focusbear.io/docs&gt;</p><p>Cheers</p>",
    ],
    [
      "Ask <b@example.com>\nThanks",
      "<p>Ask &lt;b@example.com&gt;<br>Thanks</p>",
    ],
  ])(
    "keeps line breaks when plain text has <address> or <link> (%s)",
    (text, html) => {
      expect(toSendableHtmlBody(text)).toBe(html);
    },
  );
});
