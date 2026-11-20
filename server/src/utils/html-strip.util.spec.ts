import { stripElementBlocks } from "./html-strip.util";

describe("stripElementBlocks", () => {
  it("removes each block and keeps the text around it", () => {
    expect(
      stripElementBlocks(
        'a<script>one()</script>b<SCRIPT type="x">two()</SCRIPT >c',
        "script",
      ),
    ).toBe("abc");
  });

  it("tolerates attributes and whitespace in the closing tag", () => {
    expect(stripElementBlocks("a<style>p{}</style foo>b", "style")).toBe("ab");
  });

  it("leaves similarly named tags alone", () => {
    const html = "<scripture>verse</scripture><styles>x</styles>";

    expect(stripElementBlocks(html, "script")).toBe(html);
    expect(stripElementBlocks(html, "style")).toBe(html);
  });

  it("leaves an opening tag with no closing tag in place", () => {
    expect(stripElementBlocks("a<script>never closed", "script")).toBe(
      "a<script>never closed",
    );
  });

  it("returns input without the tag unchanged", () => {
    expect(stripElementBlocks("<p>hello</p>", "script")).toBe("<p>hello</p>");
    expect(stripElementBlocks("", "script")).toBe("");
  });

  it("stays fast on thousands of unclosed tags", () => {
    const html = "<style>".repeat(200_000);
    const start = Date.now();

    stripElementBlocks(html, "style");

    expect(Date.now() - start).toBeLessThan(1000);
  });
});
