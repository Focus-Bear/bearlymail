import { stripElementBlocks, stripTags } from "./html-strip.util";

/**
 * Real HTML tags an email body would use. Stricter than `looksLikeHtml`, which
 * matches anything shaped like `<word…>`: plain text often has
 * `<jane@example.com>` or `<https://…>`, and treating those as HTML would drop
 * the line breaks and hide the address or link. The tag name must be followed
 * by whitespace, `/` or `>`, so `<b@example.com>` is not `<b>`. The attribute
 * part is bounded to avoid catastrophic backtracking (CWE-1333).
 */
const HTML_TAG_PATTERN =
  /<\/?(?:a|b|i|u|p|br|hr|div|span|strong|em|ul|ol|li|h[1-6]|blockquote|pre|code|table|thead|tbody|tr|td|th|img|font|html|body)(?=[\s/>])[^>]{0,2048}>/i;

export const isHtmlBody = (body: string): boolean =>
  HTML_TAG_PATTERN.test(body);

/** Strips HTML to readable text, keeping line breaks and decoding entities. */
export function htmlToPlainText(html: string): string {
  return (
    // Word-boundary matching avoids tags like `<scripture>`/`<styles>`, and
    // end tags tolerate whitespace/attributes (e.g. `</script foo>`), or a
    // crafted closing tag leaves script text behind (CWE-116).
    stripTags(
      stripElementBlocks(stripElementBlocks(html, "script"), "style")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<li(?=[\s>])/gi, "- <li")
        .replace(/<\/p>/gi, "\n\n")
        .replace(/<\/(?:div|li|tr|h[1-6]|blockquote)>/gi, "\n"),
    )
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/&#(\d+);/g, (_, code) =>
        String.fromCharCode(parseInt(code, 10)),
      )
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
        String.fromCharCode(parseInt(hex, 16)),
      )
      // Decode `&amp;` LAST so `&amp;lt;` becomes `&lt;`, not `<` (double-escaping, CWE-116).
      .replace(/&amp;/g, "&")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/**
 * The body as plain text: HTML is stripped, text is returned untouched (so
 * `Jane <jane@example.com>` keeps its address). Used for the text part of a
 * message, which Apple Mail sends on its own (#514).
 */
export function toPlainTextBody(body: string): string {
  return isHtmlBody(body) ? htmlToPlainText(body) : body;
}
