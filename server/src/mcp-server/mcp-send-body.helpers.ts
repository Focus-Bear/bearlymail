import { looksLikeHtml } from "../emails/email-controller.helpers";

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
  if (looksLikeHtml(body)) {
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
