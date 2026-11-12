/**
 * Utility to clean email content before LLM analysis.
 *
 * - Strips HTML tags (prefers plain text)
 * - Removes email signatures
 * - Truncates quoted replies
 * - Limits character count to avoid token waste
 */

import {
  BODY_PREVIEW_LENGTHS,
  CONTENT_CLEANER,
} from "../constants/llm-constants";

// Common signature markers
const SIGNATURE_PATTERNS = [
  // Standard "--"
  /^--\s*$/m,
  // "___" line
  /^_{3,}$/m,
  // "---" line
  /^-{3,}$/m,
  /^sent from my (iphone|ipad|android|mobile)/im,
  /^get outlook for/im,
  /^best regards?,?$/im,
  /^kind regards?,?$/im,
  /^regards?,?$/im,
  /^thanks?,?$/im,
  /^thank you,?$/im,
  /^cheers,?$/im,
  /^sincerely,?$/im,
  /^yours truly,?$/im,
  /^warm regards?,?$/im,
  /^best,?$/im,
  /^all the best,?$/im,
];

// HTML tag patterns
// Tempered greedy tokens ((?!close)[\s\S])* keep block-stripping linear (no
// nested-quantifier backtracking, CWE-1333) while the `[^>]*` closing tag stays
// robust against `</style foo>` / `</script >`. The `\b` word boundary avoids
// mis-matching tags like `<styles>` / `<scripture>`.
const HTML_PATTERNS = {
  style: /<style\b[^>]*>(?:(?!<\/style)[\s\S])*<\/style\b[^>]*>/gi,
  script: /<script\b[^>]*>(?:(?!<\/script)[\s\S])*<\/script\b[^>]*>/gi,
  tags: /<[^>]+>/g,
  entities: /&(nbsp|amp|lt|gt|quot|#\d+);/gi,
};

// Cap the input handed to the tag/quote-stripping regexes below. These scan
// email bodies (attacker-influenced) and, while each pattern is bounded, an
// unbounded input length still lets the engine retry at every '<'/'>' position
// (polynomial time, CWE-1333). The cleaned output is truncated to a few hundred
// chars anyway, so a generous scan cap loses nothing for real emails.
const MAX_EMAIL_SCAN_LENGTH = 200_000;

function capScanInput(text: string): string {
  return text.length > MAX_EMAIL_SCAN_LENGTH
    ? text.slice(0, MAX_EMAIL_SCAN_LENGTH)
    : text;
}

export interface CleanEmailContentOptions {
  /**
   * Cut at the FIRST quoted earlier message, however short the new text above
   * it. The default keeps the quote when the reply is shorter than
   * MIN_CONTENT_BEFORE_SEPARATOR so the LLM still has some context; rule
   * matching must never see quoted text, or a stranger's reply that quotes the
   * user's own "sorry" satisfies the user's "body contains sorry" rule.
   */
  dropAllQuotedReplies?: boolean;
}

/**
 * Clean email content for LLM analysis
 * @param body Email body (plain text or HTML)
 * @param htmlBody Optional HTML body (will use this to extract text if body is empty)
 * @param maxLength Maximum characters to return (default 1000)
 */
export function cleanEmailContent(
  body: string | null | undefined,
  htmlBody?: string | null,
  maxLength: number = BODY_PREVIEW_LENGTHS.CLASSIFICATION_PREVIEW,
  options: CleanEmailContentOptions = {},
): string {
  const dropAllQuotedReplies = options.dropAllQuotedReplies === true;
  const htmlToText = (html: string): string =>
    stripHtml(dropAllQuotedReplies ? cutHtmlAtReplyQuote(html) : html);
  let content = "";

  if (htmlBody && htmlBody.trim()) {
    content = htmlToText(htmlBody);
  }

  if (!content.trim()) {
    content = body?.trim() || "";
  }

  if (
    content.startsWith("<") ||
    content.includes("<html") ||
    content.includes("<body")
  ) {
    content = htmlToText(content);
  }

  if (content.includes("<") && content.includes(">")) {
    content = htmlToText(content);
  }

  if (dropAllQuotedReplies) {
    content = cutTextAtReplyQuote(content);
  }

  // Remove quoted replies (earlier messages in thread)
  content = removeQuotedReplies(content);

  // Remove email signatures
  content = removeSignature(content);

  // Drop zero-width / invisible preheader padding (runs on plain-text bodies
  // too, which never pass through stripHtml's entity decoding)
  content = stripInvisibleChars(content);

  // Clean up whitespace
  content = normalizeWhitespace(content);

  // Truncate to max length, trying to end at a sentence
  content = smartTruncate(content, maxLength);

  return content;
}

/**
 * Builds a deterministic, non-LLM summary from an email's content, used for
 * low-priority threads that skip background LLM summarisation. Reuses
 * {@link cleanEmailContent} (HTML strip, signature/quote removal, sentence-
 * boundary truncation) capped at a short, inbox-preview-friendly length.
 *
 * Returns "" when there is no usable text, so callers can fall back to leaving
 * the summary blank rather than storing an empty string.
 */
export function buildDeterministicSummary(
  body: string | null | undefined,
  htmlBody?: string | null,
): string {
  const summary = cleanEmailContent(
    body,
    htmlBody,
    BODY_PREVIEW_LENGTHS.DETERMINISTIC_SUMMARY,
  );
  return summary ? `🐢 ${summary}` : "";
}

/**
 * Builds the text that deterministic composite-rule matching searches.
 *
 * Unlike {@link cleanEmailContent} — which prefers a single source (HTML when
 * present, otherwise the plain-text body) — this UNIONS the cleaned plain-text
 * body and the cleaned HTML-derived text, so a `contains` / `NOT contains`
 * phrase matches when it appears in EITHER. This closes the gap where content
 * lives only in the HTML part (e.g. marketing emails whose `text/plain` part is
 * a stub like "View this email in your browser").
 *
 * Each source is capped at `maxLength` independently; the union is not
 * re-truncated because substring matching has no token cost. When the two
 * sources are identical (the common case where `body` is just the HTML stripped
 * to text) only one copy is returned.
 *
 * Both sources drop every quoted earlier message (reply attributions, Outlook
 * header blocks, Gmail/Outlook/Apple quote containers), so a rule only ever
 * matches what THIS message's sender wrote. Forwarded content is kept — it is
 * the substance of a forward.
 */
export function buildRuleMatchText(
  body: string | null | undefined,
  htmlBody?: string | null,
  maxLength: number = BODY_PREVIEW_LENGTHS.RULE_MATCH,
): string {
  const ruleMatchOptions: CleanEmailContentOptions = {
    dropAllQuotedReplies: true,
  };
  const plain = cleanEmailContent(body, null, maxLength, ruleMatchOptions);
  const fromHtml = htmlBody?.trim()
    ? cleanEmailContent("", htmlBody, maxLength, ruleMatchOptions)
    : "";

  if (!fromHtml || fromHtml === plain) {
    return plain;
  }
  if (!plain) {
    return fromHtml;
  }
  return `${plain}\n\n${fromHtml}`;
}

/**
 * Strip HTML tags and decode entities
 */
function stripHtml(html: string): string {
  if (!html) return "";

  let text = capScanInput(html);

  // Remove style and script blocks completely
  text = text.replace(HTML_PATTERNS.style, "");
  text = text.replace(HTML_PATTERNS.script, "");

  // Convert common block elements to newlines
  text = text.replace(/<\/(p|div|br|li|tr|h[1-6])>/gi, "\n");
  text = text.replace(/<(br|hr)\s*\/?>/gi, "\n");

  // Remove all remaining HTML tags
  text = text.replace(HTML_PATTERNS.tags, "");

  // Decode HTML entities
  text = text.replace(/&nbsp;/gi, " ");
  text = text.replace(/&lt;/gi, "<");
  text = text.replace(/&gt;/gi, ">");
  text = text.replace(/&quot;/gi, '"');
  text = text.replace(/&apos;/gi, "'");
  // Numeric entities, both decimal (&#8204;, &#39;) and hex (&#x200c;)
  text = text.replace(/&#(\d+);/g, (_, code) =>
    String.fromCharCode(parseInt(code, 10)),
  );
  text = text.replace(/&#x([0-9a-f]+);/gi, (_, code) =>
    String.fromCharCode(parseInt(code, 16)),
  );
  // Decode `&amp;` LAST so `&amp;lt;` becomes `&lt;`, not `<` (double-escaping, CWE-116).
  text = text.replace(/&amp;/gi, "&");

  return text;
}

/**
 * Strip zero-width / invisible characters and their HTML-entity forms.
 *
 * Marketing emails pad their preheader with long runs of zero-width
 * non-joiners (`&zwnj;` / `&#8204;` / U+200C) and non-breaking spaces so the
 * preview text shown by an inbox stays blank. Left in place they leak into our
 * deterministic summaries as literal "&zwnj;" tokens (when the body is plain
 * text and never went through entity decoding) or as invisible bloat that
 * skews length-based truncation.
 */
function stripInvisibleChars(text: string): string {
  return (
    text
      // Named entity forms that our decoder above doesn't expand
      .replace(/&(zwnj|zwj|zwsp|shy|lrm|rlm|feff);/gi, "")
      // Decoded Unicode forms: ZWSP, ZWNJ, ZWJ, word-joiner, BOM, soft hyphen
      .replace(/[\u200B-\u200D\u2060\uFEFF\u00AD]/g, "")
  );
}

// Unbounded `.+` chains and open-ended `-{n,}` runs are bounded below so each
// separator match stays linear on adversarial input (polynomial ReDoS, CWE-1333);
// the caps are far larger than any real reply/forward header segment.
const REPLY_SEPARATOR_PATTERNS: RegExp[] = [
  /^On .+wrote:\s*$/im,
  /-{5,80}\s*Forwarded message\s*-{5,80}/i,
  /^Begin forwarded message:\s*$/im,
  /-{5,80}Original Message-{5,80}/i,
  /From:.+\nSent:.+\nTo:.+\nSubject:/im,
  /^On .{1,200} at .{1,200}, .{1,200} wrote:\s*$/im,
  /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\s+\d{1,2}:\d{2}\s*(?:AM|PM)?[^<\n]{1,200}<[^@\n]{1,200}@[^>\n]{1,200}>:\s*$/im,
  /-{3,80}\s*(?:Reply|Write|Respond)\s+(?:above|below)\s+this\s+line\s*-{3,80}/i,
];

const MIN_CONTENT_BEFORE_SEPARATOR = 100;

function truncateAtSeparator(text: string, pattern: RegExp): string {
  const match = capScanInput(text).match(pattern);
  if (!match) return text;
  const index = text.indexOf(match[0]);
  return index > MIN_CONTENT_BEFORE_SEPARATOR
    ? text.substring(0, index).trim()
    : text;
}

// Quote-container openers in HTML replies. Each is bounded (`[^>]{0,300}`) so
// the scan stays linear on attacker-influenced bodies (CWE-1333).
const HTML_REPLY_QUOTE_MARKERS: RegExp[] = [
  // Gmail (`gmail_quote`, `gmail_quote gmail_quote_container`)
  /<(?:div|blockquote)\b[^>]{0,300}\bclass=["']?gmail_quote\b/i,
  // Apple Mail / Thunderbird
  /<blockquote\b[^>]{0,300}\btype=["']?cite\b/i,
  /<div\b[^>]{0,300}\bclass=["']?moz-cite-prefix\b/i,
  // Outlook on the web / new Outlook
  /<div\b[^>]{0,300}\bid=["']?divRplyFwdMsg\b/i,
  /<div\b[^>]{0,300}\bid=["']?appendonsend\b/i,
  // Outlook for Mac
  /<div\b[^>]{0,300}\bid=["']?mail-editor-reference-message-container\b/i,
  // Outlook desktop's From/Sent header block
  /<div\b[^>]{0,300}border-top:\s{0,5}solid\s{1,5}#(?:E1E1E1|B5C4DF)/i,
  // Yahoo
  /<div\b[^>]{0,300}\bclass=["']?yahoo_quoted\b/i,
];

// Plain-text openers of a quoted earlier message.
const TEXT_REPLY_QUOTE_MARKERS: RegExp[] = [
  /^On [^\n]{1,250}wrote:[ \t\r]*$/im,
  // Attribution wrapped onto a second line ("On …, Jeremy <\njeremy@…> wrote:")
  /^On [^\n]{1,250}\n[^\n]{0,250}wrote:[ \t\r]*$/im,
  // Outlook header block: "From: …" then "Sent: …", blank lines allowed between
  // and no fixed To/Cc/Subject order after it (a Cc line broke the old pattern).
  // "Date:" is deliberately not accepted — form/notification bodies use
  // From/Date lines; Outlook for Mac's Date variant is caught by its HTML marker.
  /^[ \t*]*From:[^\n]{1,300}\n(?:[ \t\r]*\n){0,2}[ \t*]*Sent:[^\n]{1,300}$/im,
  /-{5,80}\s*Original Message\s*-{5,80}/i,
  /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\s+\d{1,2}:\d{2}\s*(?:AM|PM)?[^<\n]{1,200}<[^@\n]{1,200}@[^>\n]{1,200}>:\s*$/im,
  /-{3,80}\s*(?:Reply|Write|Respond)\s+(?:above|below)\s+this\s+line\s*-{3,80}/i,
];

const FORWARD_MARKER_PATTERNS: RegExp[] = [
  /-{5,80}\s*Forwarded message\s*-{5,80}/i,
  /Begin forwarded message:/i,
];

/** How far into a quote container a forward marker may sit (Gmail puts it inside). */
const FORWARD_MARKER_LOOKAHEAD_CHARS = 600;

function earliestMatchIndex(text: string, patterns: RegExp[]): number | null {
  let earliest: number | null = null;
  for (const pattern of patterns) {
    const index = pattern.exec(text)?.index;
    if (index !== undefined && (earliest === null || index < earliest)) {
      earliest = index;
    }
  }
  return earliest;
}

/**
 * Drops an HTML reply's quoted earlier message: everything from the first
 * quote container on. Returns the input unchanged when there is no quote, when
 * the "quote" is forwarded content (a forward marker before or just inside
 * it), or when nothing but markup would be left (a forward with no preamble).
 */
function cutHtmlAtReplyQuote(html: string): string {
  const scanned = capScanInput(html);
  const quoteIndex = earliestMatchIndex(scanned, HTML_REPLY_QUOTE_MARKERS);
  if (quoteIndex === null) return html;
  const forwardIndex = earliestMatchIndex(scanned, FORWARD_MARKER_PATTERNS);
  if (
    forwardIndex !== null &&
    forwardIndex < quoteIndex + FORWARD_MARKER_LOOKAHEAD_CHARS
  ) {
    return html;
  }
  const head = scanned.slice(0, quoteIndex);
  return stripHtml(head).trim() ? head : html;
}

/**
 * Plain-text counterpart of {@link cutHtmlAtReplyQuote}: keeps only the text
 * above the first reply attribution / Outlook header, with the same forward
 * and nothing-left exceptions.
 */
function cutTextAtReplyQuote(text: string): string {
  const scanned = capScanInput(text);
  const quoteIndex = earliestMatchIndex(scanned, TEXT_REPLY_QUOTE_MARKERS);
  if (quoteIndex === null) return text;
  const forwardIndex = earliestMatchIndex(scanned, FORWARD_MARKER_PATTERNS);
  if (forwardIndex !== null && forwardIndex < quoteIndex) return text;
  const head = scanned.slice(0, quoteIndex);
  return head.trim() ? head : text;
}

/**
 * Remove quoted reply content - detect reply separators and only keep the last reply
 */
function removeQuotedReplies(text: string): string {
  let result = capScanInput(text);

  for (const pattern of REPLY_SEPARATOR_PATTERNS) {
    result = truncateAtSeparator(result, pattern);
  }

  // Drop quoted lines with plain string ops rather than a regex — no backtracking
  // to worry about at all (ReDoS, CWE-1333).
  result = result
    .split("\n")
    .filter((line) => !line.startsWith(">"))
    .join("\n");

  return result;
}

/**
 * Remove email signature
 */
function removeSignature(text: string): string {
  let result = text;
  let cutoffIndex = result.length;

  // Find signature markers and cut off at the earliest one
  for (const pattern of SIGNATURE_PATTERNS) {
    const match = result.match(pattern);
    if (match) {
      const index = result.search(pattern);
      // Only cut if there's meaningful content before (at least MIN_CONTENT_BEFORE_SIGNATURE chars)
      // and the signature isn't at the very beginning
      if (
        index > CONTENT_CLEANER.MIN_CONTENT_BEFORE_SIGNATURE &&
        index < cutoffIndex
      ) {
        cutoffIndex = index;
      }
    }
  }

  if (cutoffIndex < result.length) {
    result = result.substring(0, cutoffIndex).trim();
  }

  return result;
}

/**
 * Normalize whitespace
 */
function normalizeWhitespace(text: string): string {
  return (
    text
      // Normalize line endings
      .replace(/\r\n/g, "\n")
      // Max 2 consecutive newlines
      .replace(/\n{3,}/g, "\n\n")
      // Multiple spaces/tabs to single space
      .replace(/[ \t]+/g, " ")
      // Trim each line. Spaces/tabs ONLY: `\s` includes `\n`, so `/\s+$/gm`
      // swallowed the line breaks themselves — any block boundary whose source
      // also carried a newline (`</p>\n<p>`, i.e. essentially every HTML email)
      // collapsed into "...ends here.Starts here." before the LLM ever saw it.
      .replace(/^[ \t]+|[ \t]+$/gm, "")
      .trim()
  );
}

/**
 * Smart truncate - try to end at a sentence boundary
 */
function smartTruncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  const searchStart = Math.max(
    0,
    maxLength - CONTENT_CLEANER.SENTENCE_BOUNDARY_SEARCH_REGION,
  );
  const searchEnd = maxLength;
  const searchRegion = text.substring(searchStart, searchEnd);

  // Look for sentence endings (., !, ?)
  const sentenceEndMatch = searchRegion.match(/[.!?]\s+[A-Z]/);
  if (sentenceEndMatch) {
    // Include the punctuation
    const endIndex = searchStart + sentenceEndMatch.index! + 1;
    return text.substring(0, endIndex).trim();
  }

  // Fallback: try to end at a word boundary
  const truncated = text.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > maxLength - CONTENT_CLEANER.WORD_BOUNDARY_THRESHOLD) {
    return `${truncated.substring(0, lastSpace).trim()}...`;
  }

  return `${truncated.trim()}...`;
}

/**
 * Clean email content for thread summarization (multiple messages)
 * Uses a smaller limit per message
 */
export function cleanEmailForThread(
  body: string | null | undefined,
  htmlBody?: string | null,
  maxLengthPerMessage: number = BODY_PREVIEW_LENGTHS.SINGLE_PREVIEW,
): string {
  return cleanEmailContent(body, htmlBody, maxLengthPerMessage);
}

/**
 * Get a very short preview of email content (for snippets)
 */
export function getEmailPreview(
  body: string | null | undefined,
  htmlBody?: string | null,
  maxLength: number = CONTENT_CLEANER.EMAIL_PREVIEW_MAX,
): string {
  const cleaned = cleanEmailContent(
    body,
    htmlBody,
    maxLength + CONTENT_CLEANER.PREVIEW_BUFFER,
  );
  // For previews, also remove newlines
  return cleaned.replace(/\n+/g, " ").substring(0, maxLength).trim();
}
