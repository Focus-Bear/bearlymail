import {
  htmlToPlainText,
  receivedEmailText,
  toPlainTextBody,
} from "./plain-text-body.util";

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

  it.each([
    [
      "text and address",
      '<a href="https://e.test/x?a=1&amp;b=2">the plan</a>',
      "the plan (https://e.test/x?a=1&b=2)",
    ],
    [
      "single quotes",
      "<a class='b' href='https://e.test/x'>go</a>",
      "go (https://e.test/x)",
    ],
    ["no quotes", "<a href=https://e.test/x>go</a>", "go (https://e.test/x)"],
    ["address already shown", '<a href="https://e.test/">e.test</a>', "e.test"],
    ["email address", '<a href="mailto:jo@e.test">Jo</a>', "Jo (jo@e.test)"],
    [
      "same email address",
      '<a href="mailto:jo@e.test">jo@e.test</a>',
      "jo@e.test",
    ],
    [
      "image link",
      '<a href="https://e.test/x"><img src="y"></a>',
      "https://e.test/x",
    ],
    [
      "bold link",
      '<A HREF="https://e.test/x"><b>go</b></A>',
      "go (https://e.test/x)",
    ],
    [
      "two links",
      '<a href="https://a.test">a</a> <a href="https://b.test">b</a>',
      "a (https://a.test) b (https://b.test)",
    ],
    ["no real address", '<a href="#top">top</a> <a name="x">y</a>', "top y"],
    ["script address", '<a href="javascript:x()">go</a>', "go"],
    ["not a link", '<abbr>HTML</abbr> <a href="https://e.test">go', "HTML go"],
  ])("keeps link addresses: %s", (_name, html, expected) => {
    expect(htmlToPlainText(html)).toBe(expected);
  });

  it("keeps positions right after letters that change length in lowercase", () => {
    expect(
      htmlToPlainText(
        `<p>${"İ".repeat(40)}</p><a href="https://e.test">go</a> end`,
      ),
    ).toBe(`${"İ".repeat(40)}\n\ngo (https://e.test) end`);
  });

  it("does not take </abbr> for the end of a link", () => {
    expect(
      htmlToPlainText('<a href="https://e.test"><abbr>HTML</abbr> guide</a>'),
    ).toBe("HTML guide (https://e.test)");
  });

  it("keeps editor lists tight", () => {
    expect(
      htmlToPlainText("<ul><li><p>one</p></li><li><p>two</p></li></ul>"),
    ).toBe("- one\n- two");
  });

  it("handles huge malformed input quickly", () => {
    const start = Date.now();
    for (const part of ["<a ", '<a href="x">', "<a></a", "<p ", "<br ", "<"]) {
      htmlToPlainText(part.repeat(60_000));
    }
    expect(Date.now() - start).toBeLessThan(5_000);
  });

  it("keeps a received email's text as is, even when it mentions tags", () => {
    const body = "Use <div> and <b>, from Jo <jo@example.com>";
    expect(receivedEmailText({ body, htmlBody: "<p>x</p>" })).toBe(body);
    expect(receivedEmailText({ body })).toBe(body);
  });

  it("converts a received email that only has HTML", () => {
    expect(receivedEmailText({ body: "", htmlBody: "<p>Hi</p>" })).toBe("Hi");
    expect(receivedEmailText({ body: "<div>Hi</div>" })).toBe("Hi");
    expect(receivedEmailText({ body: null, htmlBody: null })).toBe("");
  });

  it("leaves plain text alone, including addresses and links in angle brackets", () => {
    const text =
      "From: Jo <jo@example.com>\n\n\n\nSee <https://example.com>, 1 < 2";
    expect(toPlainTextBody(text)).toBe(text);
  });
});
