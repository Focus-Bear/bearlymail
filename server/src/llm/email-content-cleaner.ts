/**
 * Utility to clean email content before LLM analysis.
 *
 * - Strips HTML tags (prefers plain text)
 * - Removes email signatures
 * - Truncates quoted replies
 * - Limits character count to avoid token waste
 */

import {
  CONTENT_CLEANER,
  BODY_PREVIEW_LENGTHS,
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
const HTML_PATTERNS = {
  style: /<style[^>]*>[\s\S]*?<\/style>/gi,
  script: /<script[^>]*>[\s\S]*?<\/script>/gi,
  tags: /<[^>]+>/g,
  entities: /&(nbsp|amp|lt|gt|quot|#\d+);/gi,
};

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
): string {
  let content = "";

  if (htmlBody && htmlBody.trim()) {
    content = stripHtml(htmlBody);
  }

  if (!content.trim()) {
    content = body?.trim() || "";
  }

  if (
    content.startsWith("<") ||
    content.includes("<html") ||
    content.includes("<body")
  ) {
    content = stripHtml(content);
  }

  if (content.includes("<") && content.includes(">")) {
    content = stripHtml(content);
  }

  // Remove quoted replies (earlier messages in thread)
  content = removeQuotedReplies(content);

  // Remove email signatures
  content = removeSignature(content);

  // Clean up whitespace
  content = normalizeWhitespace(content);

  // Truncate to max length, trying to end at a sentence
  content = smartTruncate(content, maxLength);

  return content;
}

/**
 * Strip HTML tags and decode entities
 */
function stripHtml(html: string): string {
  if (!html) return "";

  let text = html;

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
  text = text.replace(/&amp;/gi, "&");
  text = text.replace(/&lt;/gi, "<");
  text = text.replace(/&gt;/gi, ">");
  text = text.replace(/&quot;/gi, '"');
  text = text.replace(/&#(\d+);/gi, (_, code) =>
    String.fromCharCode(parseInt(code, 10)),
  );

  return text;
}

const REPLY_SEPARATOR_PATTERNS: RegExp[] = [
  /^On .+wrote:\s*$/im,
  /-{5,}\s*Forwarded message\s*-{5,}/i,
  /^Begin forwarded message:\s*$/im,
  /-{5,}Original Message-{5,}/i,
  /From:.+\nSent:.+\nTo:.+\nSubject:/im,
  /^On .+ at .+, .+ wrote:\s*$/im,
  /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\s+\d{1,2}:\d{2}\s*(AM|PM)?\s*.+<.+@.+>:\s*$/im,
  /-{3,}\s*(Reply|Write|Respond)\s+(above|below)\s+this\s+line\s*-{3,}/i,
];

const MIN_CONTENT_BEFORE_SEPARATOR = 100;

function truncateAtSeparator(text: string, pattern: RegExp): string {
  const match = text.match(pattern);
  if (!match) return text;
  const index = text.indexOf(match[0]);
  return index > MIN_CONTENT_BEFORE_SEPARATOR
    ? text.substring(0, index).trim()
    : text;
}

/**
 * Remove quoted reply content - detect reply separators and only keep the last reply
 */
function removeQuotedReplies(text: string): string {
  let result = text;

  for (const pattern of REPLY_SEPARATOR_PATTERNS) {
    result = truncateAtSeparator(result, pattern);
  }

  result = result.replace(/^>+\s*.*$/gm, "");

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
      // Trim each line
      .replace(/^\s+|\s+$/gm, "")
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
