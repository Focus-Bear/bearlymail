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

/** Stored text that is really HTML starts with a tag; text that only mentions one doesn't. */
const STARTS_WITH_HTML_TAG =
  /^\s*<(?:!doctype|html|head|body|style|meta|div|p|table|span|br)(?=[\s/>])/i;

const LINK_HREF =
  /\shref\s*=\s*(?:"([^"]{0,2048})"|'([^']{0,2048})'|([^\s"'>]{1,2048}))/i;
const LINK_SCHEME = /^(?:https?:|mailto:|tel:)/i;
const MAX_LINK_TAG_LENGTH = 8192;

/** The address to show after a link's text, or "" when the text already shows it. */
function linkSuffix(openTag: string, content: string): string {
  const match = LINK_HREF.exec(openTag.slice(0, MAX_LINK_TAG_LENGTH));
  const href = (match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim();
  if (!LINK_SCHEME.test(href)) return "";
  const address = href.replace(/^(?:mailto|tel):/i, "");
  const text = stripTags(content).trim();
  const bare = (value: string): string =>
    value.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  if (bare(text) === bare(address)) return "";
  const shown = address.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text ? ` (${shown})` : shown;
}

/**
 * Writes each link's address after its text, which plain text would otherwise
 * lose. One pass: each character is visited a bounded number of times, however
 * many unclosed links the input has.
 */
function showLinkAddresses(html: string): string {
  // Matched on `html` itself: lowercasing can change its length (`İ`), which
  // would shift every position after it.
  const open = /<a(?=\s)/gi;
  const close = /<\/a(?=[\s>])/gi;
  const kept: string[] = [];
  let cursor = 0;
  let opening = open.exec(html);
  while (opening) {
    const openEnd = html.indexOf(">", opening.index);
    if (openEnd === -1) break;
    close.lastIndex = openEnd;
    const closing = close.exec(html);
    if (!closing) break;
    kept.push(
      html.slice(cursor, closing.index),
      linkSuffix(
        html.slice(opening.index, openEnd),
        html.slice(openEnd + 1, closing.index),
      ),
    );
    cursor = closing.index;
    open.lastIndex = closing.index;
    opening = open.exec(html);
  }
  kept.push(html.slice(cursor));
  return kept.join("");
}

/** Strips HTML to readable text, keeping line breaks, link addresses and entities. */
export function htmlToPlainText(html: string): string {
  return (
    // Word-boundary matching avoids tags like `<scripture>`/`<styles>`, and
    // end tags tolerate whitespace/attributes (e.g. `</script foo>`), or a
    // crafted closing tag leaves script text behind (CWE-116).
    stripTags(
      showLinkAddresses(
        stripElementBlocks(stripElementBlocks(html, "script"), "style"),
      )
        .replace(/<\/p>\s*<\/li>/gi, "</li>")
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
 * An outgoing body as plain text: HTML is stripped, text is returned untouched
 * (so `Jane <jane@example.com>` keeps its address). Convert a body once only:
 * the result can itself mention tags, which a second pass would remove (#514).
 */
export function toPlainTextBody(body: string): string {
  return isHtmlBody(body) ? htmlToPlainText(body) : body;
}

/**
 * A received email's text, for quoting. Its text part is used as is, even when
 * it mentions tags; HTML is converted only when that is all there is.
 */
export function receivedEmailText(email: {
  body?: string | null;
  htmlBody?: string | null;
}): string {
  const text = email.body || email.htmlBody || "";
  const isHtml = !email.body || STARTS_WITH_HTML_TAG.test(text);
  return isHtml ? htmlToPlainText(text) : text;
}
