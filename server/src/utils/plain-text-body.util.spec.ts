import { htmlToPlainText, toPlainTextBody } from "./plain-text-body.util";

describe("plain text bodies (#514)", () => {
  it("strips tags and keeps paragraphs, breaks and list items readable", () => {
    expect(
      htmlToPlainText(
        "<p>Hi Sam,</p><p>One<br>Two</p><ul><li>a</li><li>b</li></ul><div>Bye</div>",
      ),
    ).toBe("Hi Sam,\n\nOne\nTwo\n\n- a\n- b\nBye");
  });

  it("decodes entities once and drops style and script content", () => {
    expect(
      htmlToPlainText(
        "<style>p{color:red}</style><p>Tom &amp; Jo &lt;jo@example.com&gt; &amp;lt;</p><script>x()</script>",
      ),
    ).toBe("Tom & Jo <jo@example.com> &lt;");
  });

  it("leaves plain text alone, including addresses and links in angle brackets", () => {
    const text =
      "From: Jo <jo@example.com>\n\n\n\nSee <https://example.com>, 1 < 2";
    expect(toPlainTextBody(text)).toBe(text);
  });
});
