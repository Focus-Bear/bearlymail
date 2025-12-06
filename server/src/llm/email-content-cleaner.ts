/**
 * Utility to clean email content before LLM analysis.
 * 
 * - Strips HTML tags (prefers plain text)
 * - Removes email signatures
 * - Truncates quoted replies
 * - Limits character count to avoid token waste
 */

// Common signature markers
const SIGNATURE_PATTERNS = [
  /^--\s*$/m,                           // Standard "--"
  /^_{3,}$/m,                           // "___" line
  /^-{3,}$/m,                           // "---" line
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

// Quoted reply patterns
const QUOTED_REPLY_PATTERNS = [
  /^>+\s*.*/gm,                         // Lines starting with >
  /^On .+ wrote:$/im,                   // "On [date], [person] wrote:"
  /^-{5,}Original Message-{5,}/im,      // Outlook style
  /^From:.+\nSent:.+\nTo:.+\nSubject:/im, // Outlook header block
  /^_{32,}$/m,                          // Long underscore line (32+ chars)
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
 * @param maxLength Maximum characters to return (default 2000)
 */
export function cleanEmailContent(
  body: string | null | undefined,
  htmlBody?: string | null,
  maxLength: number = 2000,
): string {
  // Prefer plain text body, fallback to stripped HTML
  let content = body?.trim() || '';
  
  // If body is empty or looks like HTML, try to extract from htmlBody
  if (!content || content.startsWith('<') || content.includes('<html') || content.includes('<body')) {
    content = stripHtml(htmlBody || body || '');
  }
  
  // If still looks like it has HTML tags, strip them
  if (content.includes('<') && content.includes('>')) {
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
  if (!html) return '';
  
  let text = html;
  
  // Remove style and script blocks completely
  text = text.replace(HTML_PATTERNS.style, '');
  text = text.replace(HTML_PATTERNS.script, '');
  
  // Convert common block elements to newlines
  text = text.replace(/<\/(p|div|br|li|tr|h[1-6])>/gi, '\n');
  text = text.replace(/<(br|hr)\s*\/?>/gi, '\n');
  
  // Remove all remaining HTML tags
  text = text.replace(HTML_PATTERNS.tags, '');
  
  // Decode HTML entities
  text = text.replace(/&nbsp;/gi, ' ');
  text = text.replace(/&amp;/gi, '&');
  text = text.replace(/&lt;/gi, '<');
  text = text.replace(/&gt;/gi, '>');
  text = text.replace(/&quot;/gi, '"');
  text = text.replace(/&#(\d+);/gi, (_, code) => String.fromCharCode(parseInt(code, 10)));
  
  return text;
}

/**
 * Remove quoted reply content
 */
function removeQuotedReplies(text: string): string {
  let result = text;
  
  // Find "On [date] [person] wrote:" pattern and remove everything after
  const onWroteMatch = result.match(/^On .+wrote:\s*$/im);
  if (onWroteMatch) {
    const index = result.indexOf(onWroteMatch[0]);
    if (index > 100) { // Only remove if there's meaningful content before
      result = result.substring(0, index).trim();
    }
  }
  
  // Remove lines starting with >
  result = result.replace(/^>+\s*.*$/gm, '');
  
  // Remove Outlook-style "Original Message" blocks
  const originalMsgMatch = result.match(/-{5,}Original Message-{5,}/i);
  if (originalMsgMatch) {
    const index = result.indexOf(originalMsgMatch[0]);
    if (index > 100) {
      result = result.substring(0, index).trim();
    }
  }
  
  // Remove "From: ... Sent: ... To: ... Subject:" blocks (Outlook forwarded headers)
  const outlookHeaderMatch = result.match(/From:.+\nSent:.+\nTo:.+\nSubject:/im);
  if (outlookHeaderMatch) {
    const index = result.indexOf(outlookHeaderMatch[0]);
    if (index > 100) {
      result = result.substring(0, index).trim();
    }
  }
  
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
      // Only cut if there's meaningful content before (at least 50 chars)
      // and the signature isn't at the very beginning
      if (index > 50 && index < cutoffIndex) {
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
  return text
    .replace(/\r\n/g, '\n')           // Normalize line endings
    .replace(/\n{3,}/g, '\n\n')       // Max 2 consecutive newlines
    .replace(/[ \t]+/g, ' ')          // Multiple spaces/tabs to single space
    .replace(/^\s+|\s+$/gm, '')       // Trim each line
    .trim();
}

/**
 * Smart truncate - try to end at a sentence boundary
 */
function smartTruncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  
  // Try to find a sentence end within the last 200 chars of the limit
  const searchStart = Math.max(0, maxLength - 200);
  const searchEnd = maxLength;
  const searchRegion = text.substring(searchStart, searchEnd);
  
  // Look for sentence endings (., !, ?)
  const sentenceEndMatch = searchRegion.match(/[.!?]\s+[A-Z]/);
  if (sentenceEndMatch) {
    const endIndex = searchStart + sentenceEndMatch.index! + 1; // Include the punctuation
    return text.substring(0, endIndex).trim();
  }
  
  // Fallback: try to end at a word boundary
  const truncated = text.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxLength - 50) {
    return truncated.substring(0, lastSpace).trim() + '...';
  }
  
  return truncated.trim() + '...';
}

/**
 * Clean email content for thread summarization (multiple messages)
 * Uses a smaller limit per message
 */
export function cleanEmailForThread(
  body: string | null | undefined,
  htmlBody?: string | null,
  maxLengthPerMessage: number = 800,
): string {
  return cleanEmailContent(body, htmlBody, maxLengthPerMessage);
}

/**
 * Get a very short preview of email content (for snippets)
 */
export function getEmailPreview(
  body: string | null | undefined,
  htmlBody?: string | null,
  maxLength: number = 150,
): string {
  const cleaned = cleanEmailContent(body, htmlBody, maxLength + 50);
  // For previews, also remove newlines
  return cleaned.replace(/\n+/g, ' ').substring(0, maxLength).trim();
}

