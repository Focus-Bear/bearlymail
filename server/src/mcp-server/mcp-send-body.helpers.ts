/**
 * Real HTML tags an email body would use. Stricter than `looksLikeHtml`, which
 * matches anything shaped like `<word…>`: plain text from an MCP client often
 * has `<jane@example.com>` or `<https://…>`, and treating those as HTML would
 * drop the line breaks and hide the address or link. The tag name must be
 * followed by whitespace, `/` or `>`, so `<b@example.com>` is not `<b>`.
 * The attribute part is bounded to avoid catastrophic backtracking (CWE-1333).
 */
const HTML_TAG_PATTERN =
  /<\/?(?:a|b|i|u|p|br|hr|div|span|strong|em|ul|ol|li|h[1-6]|blockquote|pre|code|table|thead|tbody|tr|td|th|img|font|html|body)(?=[\s/>])[^>]{0,2048}>/i;

const isHtmlBody = (body: string): boolean => HTML_TAG_PATTERN.test(body);

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);

/**
 * Turns an MCP send body into the HTML the send pipeline expects.
 *
 * The web composer hands the server HTML (the rich-text editor's output), and
 * the send path treats `body` as HTML: new emails go out with it as the HTML
 * part, and open tracking injects its pixel there. A plain-text body from an
 * MCP client therefore lost every line break and arrived as one run-on
 * paragraph, with the signature stuck to the last line. Blank-line-separated
 * blocks become paragraphs and single newlines become `<br>`, so the message
 * reads the way it was written. A body that is already HTML is left as is.
 */
export function toSendableHtmlBody(body: string): string {
  if (isHtmlBody(body)) {
    return body;
  }
  return body
    .replace(/\r\n?/g, "\n")
    .trim()
    .split(/\n[ \t]*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
    .map(
      (paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
}
