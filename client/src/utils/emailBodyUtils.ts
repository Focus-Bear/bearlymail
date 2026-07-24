import './sanitizeHooks';

import DOMPurify from 'dompurify';

import {
  BLOCKQUOTE_MIN_POSITION,
  BOUNDARY_FALLBACK_SEARCH_CHARS,
  HTML_CUT_POINT_OFFSET_50,
  HTML_CUT_POINT_OFFSET_100,
  MIN_CONTENT_BEFORE_BOUNDARY,
  SIGNATURE_MIN_CONTENT_CHARS,
  SIGNATURE_MIN_CONTENT_PLAINTEXT,
  TEXT_SEARCH_LAST_CHARS,
} from 'constants/numbers';
import { NODE_NAME_ANCHOR } from 'constants/strings';

/**
 * Find the cutoff index for an HTML signature by scanning HTML structure, then text representation.
 * Returns content.length if no signature is found.
 */
function findHtmlSignatureCutoff(content: string, minContentChars: number): number {
  const htmlSignaturePatterns = [
    /(<div[^>]*>[\s\S]*?(?:RESEARCH CONTRACTS|Privacy Statement|www\.rmit\.edu\.au|RMIT values your privacy)[\s\S]*?<\/div>)/i,
    /(<p[^>]*>[\s\S]*?(?:Best regards|Kind regards|Regards|Thanks|Thank you|Cheers|Sincerely|Yours truly|Warm regards|Best|All the best)[\s\S]*?<\/p>)/i,
    /(<div[^>]*>[\s\S]*?--\s*<\/div>)/i,
    /(<p[^>]*>[\s\S]*?--\s*<\/p>)/i,
    /(<div[^>]*>[\s\S]*?(?:Sent from my|Get Outlook for|Sent from Mail|Sent from iPhone|Sent from iPad)[\s\S]*?<\/div>)/i,
  ];
  let cutoffIndex = content.length;
  for (const pattern of htmlSignaturePatterns) {
    const match = content.match(pattern);
    if (match && match.index !== undefined) {
      const index = match.index;
      if (index > minContentChars && index < cutoffIndex) {
        cutoffIndex = index;
      }
    }
  }
  return cutoffIndex;
}

/**
 * Remove signature from plain-text email content.
 * Returns the trimmed content up to the signature, or the original if no signature found.
 */
function removePlainTextSignature(content: string, minContentChars: number): string {
  const signaturePatterns = [
    /\n\n--\s*$/m,
    /\n\n-{3,}\s*$/m,
    /\n\n_{3,}\s*$/m,
    /\n\n(Best regards?|Kind regards?|Regards?|Thanks?|Thank you|Cheers?|Sincerely|Yours truly|Warm regards?|Best|All the best)[\s\S]*$/i,
    /\n\n(Sent from my|Get Outlook for|Sent from Mail|Sent from iPhone|Sent from iPad)[\s\S]*$/i,
    /\n\nRESEARCH CONTRACTS TEAM[\s\S]*?Privacy[\s\S]*$/i,
    /\n\nRMIT[\s\S]*?(Privacy|www\.rmit\.edu\.au)[\s\S]*$/i,
  ];
  let cutoffIndex = content.length;
  for (const pattern of signaturePatterns) {
    const match = content.match(pattern);
    if (match && match.index !== undefined && match.index > minContentChars && match.index < cutoffIndex) {
      cutoffIndex = match.index;
    }
  }
  return cutoffIndex < content.length ? content.substring(0, cutoffIndex).trim() : content;
}

/**
 * Remove email signature from text (works for both plain text and HTML)
 */
export function removeSignature(content: string, isHtml: boolean = false): string {
  if (!content) {
    return '';
  }

  if (isHtml) {
    let cutoffIndex = findHtmlSignatureCutoff(content, SIGNATURE_MIN_CONTENT_CHARS);

    // Also refine using plain text representation for additional patterns
    const cleanedContent = removeCidImagesFromString(content);
    const doc = new DOMParser().parseFromString(cleanedContent, 'text/html');
    const text = doc.body.textContent || doc.body.innerText || '';
    const textSignaturePatterns = [
      /\n\n--\s*$/m,
      /\n\n-{3,}\s*$/m,
      /\n\nRESEARCH CONTRACTS TEAM[\s\S]*?Privacy[\s\S]*$/i,
      /\n\n(Best regards?|Kind regards?|Regards?|Thanks?|Thank you|Cheers?|Sincerely|Yours truly|Warm regards?|Best|All the best)[\s\S]*$/i,
      /\n\nRMIT[\s\S]*?(Privacy|www\.rmit\.edu\.au)[\s\S]*$/i,
    ];
    for (const pattern of textSignaturePatterns) {
      const match = text.match(pattern);
      if (match && match.index !== undefined) {
        const textBeforeSig = text.substring(0, match.index);
        const htmlPos = content.indexOf(textBeforeSig.slice(-TEXT_SEARCH_LAST_CHARS));
        if (htmlPos > SIGNATURE_MIN_CONTENT_CHARS && htmlPos < cutoffIndex) {
          cutoffIndex = htmlPos;
        }
      }
    }

    return cutoffIndex < content.length ? content.substring(0, cutoffIndex).trim() : content;
  }

  return removePlainTextSignature(content, SIGNATURE_MIN_CONTENT_PLAINTEXT);
}

/**
 * Remove cid: image URLs from HTML string before DOM parsing
 * This prevents the browser from attempting to load embedded email images
 */
function removeCidImagesFromString(html: string): string {
  if (!html) {
    return '';
  }
  return html.replace(/<img[^>]*src=["']cid:[^"']*["'][^>]*>/gi, '');
}

/**
 * Result of extracting a clean HTML body, including whether content was truncated.
 */
export interface CleanHtmlResult {
  html: string;
  wasTruncated: boolean;
}

/**
 * Result of extracting a clean plain-text body, including whether content was truncated.
 */
export interface CleanBodyResult {
  text: string;
  wasTruncated: boolean;
}

/**
 * Helper function to clean HTML body by removing quoted/forwarded email content.
 * Returns both the cleaned HTML and a flag indicating whether content was truncated.
 */
export function extractCleanHtmlBodyWithMeta(htmlBody: string): CleanHtmlResult {
  if (!htmlBody) {
    return { html: '', wasTruncated: false };
  }

  // Remove cid: images before parsing to prevent browser from trying to load them
  const cleanedHtml = removeCidImagesFromString(htmlBody);

  // Parse safely to prevent triggering network requests (e.g., tracking pixels from <img> tags)
  const doc = new DOMParser().parseFromString(cleanedHtml, 'text/html');
  const textContent = doc.body.textContent || doc.body.innerText || '';

  // Simple patterns that catch most email boundaries
  const boundaryPatterns = [
    // "On [date] at [time] [name] <email> wrote:" - Gmail style
    /On\s+\w+,\s+\d{1,2}\s+\w+\s+\d{4}\s+at\s+\d{1,2}:\d{2}.*?wrote:/i,
    // "On [date] [name] wrote:" - common pattern
    /On\s+\w+,\s+\d{1,2}\s+\w+\s+\d{4}.*?wrote:/i,
    // "From: [name] <email>" with date/time
    /From:\s+.*?<.*?@.*?>\s+Sent:\s+.*?Subject:/i,
    // "-----Original Message-----"
    /-----Original Message-----/i,
    // "Date: ... From: ... To: ... Subject: ..."
    /Date:\s+.*?\nFrom:\s+.*?\nTo:\s+.*?\nSubject:/i,
  ];

  let cutoffIndex = textContent.length;
  for (const pattern of boundaryPatterns) {
    const match = textContent.search(pattern);
    if (match > 0 && match < cutoffIndex) {
      // Need at least 20 chars of content before boundary
      if (match > MIN_CONTENT_BEFORE_BOUNDARY) {
        cutoffIndex = match;
      }
    }
  }

  // If we found a boundary, find it in the HTML.
  // Try progressively shorter suffixes of the pre-boundary text to handle emails where
  // the reply spans multiple HTML elements (e.g. several <div>s or <br>-separated lines).
  // textContent concatenates text nodes without element separators, so a 50-char slice
  // can straddle a tag boundary and fail with a direct indexOf on the raw HTML.
  if (cutoffIndex < textContent.length) {
    const textBeforeBoundary = textContent.substring(0, cutoffIndex);
    const startLen = Math.min(HTML_CUT_POINT_OFFSET_50, textBeforeBoundary.length);
    for (let searchLen = startLen; searchLen >= 10; searchLen -= 10) {
      const searchText = textBeforeBoundary.slice(-searchLen);
      if (!searchText) {
        continue;
      }
      const htmlPos = htmlBody.indexOf(searchText);
      if (htmlPos >= 0) {
        let cutPoint = htmlPos + searchText.length;
        const nextTagStart = htmlBody.indexOf('<', cutPoint);
        if (nextTagStart >= 0 && nextTagStart - cutPoint < HTML_CUT_POINT_OFFSET_100) {
          cutPoint = nextTagStart;
        }
        return { html: htmlBody.substring(0, cutPoint).trim(), wasTruncated: true };
      }
    }
    // Final fallback: search for the start of the boundary text directly in the HTML.
    // Handles emails where all pre-boundary content is fragmented across very small elements.
    const boundaryStart = textContent.substring(cutoffIndex, cutoffIndex + BOUNDARY_FALLBACK_SEARCH_CHARS);
    if (boundaryStart.length >= 8) {
      const htmlBoundaryPos = htmlBody.indexOf(boundaryStart);
      if (htmlBoundaryPos > BLOCKQUOTE_MIN_POSITION) {
        return { html: htmlBody.substring(0, htmlBoundaryPos).trim(), wasTruncated: true };
      }
    }
  }

  // Also check for HTML blockquote tags
  const blockquoteMatch = htmlBody.search(/<blockquote[^>]*>/i);
  if (blockquoteMatch > BLOCKQUOTE_MIN_POSITION) {
    return { html: htmlBody.substring(0, blockquoteMatch).trim(), wasTruncated: true };
  }

  return { html: htmlBody, wasTruncated: false };
}

/**
 * Helper function to clean HTML body by removing quoted/forwarded email content
 */
export function extractCleanHtmlBody(htmlBody: string): string {
  return extractCleanHtmlBodyWithMeta(htmlBody).html;
}

/**
 * Returns true when text appears to be HTML content (contains common HTML tags).
 * Used to detect when the plain-text `body` field actually contains HTML markup
 * so it can be routed to the HTML rendering path instead of displaying raw tags.
 */
export function looksLikeHtml(text: string): boolean {
  return /<(p|br|div|span|style|html|body|table|ul|ol|li|h[1-6]|a|img|strong|em)\b[^>]*>/i.test(text);
}

const URL_REGEX = /https?:\/\/[^\s<>"'`,;!?\])}]+(?:[/?#][^\s<>"'`,;!?\])}]*)?/g;

function isInsideAnchor(node: Node): boolean {
  let parent = node.parentNode;
  while (parent) {
    if (parent.nodeName === NODE_NAME_ANCHOR) {
      return true;
    }
    parent = parent.parentNode;
  }
  return false;
}

/**
 * Replace URL matches in a text node with anchor elements.
 * Returns true if any replacements were made.
 */
function replaceUrlsInTextNode(textNode: Text, text: string): void {
  URL_REGEX.lastIndex = 0;
  const fragment = document.createDocumentFragment();
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = URL_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }
    const url = match[0];
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.textContent = url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    fragment.appendChild(anchor);
    lastIndex = match.index + url.length;
  }

  if (lastIndex < text.length) {
    fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
  }

  if (lastIndex > 0) {
    textNode.parentNode?.replaceChild(fragment, textNode);
  }
}

function linkifyTextNodes(root: HTMLElement): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const textNodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    textNodes.push(current as Text);
    current = walker.nextNode();
  }

  for (const textNode of textNodes) {
    if (isInsideAnchor(textNode)) {
      continue;
    }
    const text = textNode.nodeValue || '';
    if (!URL_REGEX.test(text)) {
      continue;
    }
    replaceUrlsInTextNode(textNode, text);
  }
}

/**
 * Neutralise `@media (prefers-color-scheme: dark)` rules in the email's own `<style>` blocks.
 *
 * BearlyMail is a light-only client and renders email HTML over a light background. Many
 * marketing emails ship dark-mode CSS that flips backgrounds to black/dark. Because the render
 * context follows the OS colour-scheme preference, those rules activate when the user's OS is in
 * dark mode and produce broken dark backgrounds inside the otherwise-light UI. Setting
 * `color-scheme: light` does NOT stop this — `prefers-color-scheme` always reflects the OS
 * setting — so we defuse the condition itself by renaming the media feature to an unrecognised
 * one. Browsers silently treat an unknown media feature as never-matching, regardless of the
 * viewport size or render timing, leaving the email's light styles as the only ones that apply.
 */
export function neutralizeDarkModeStyles(root: HTMLElement): void {
  const styleElements = root.querySelectorAll('style');
  styleElements.forEach(styleEl => {
    const css = styleEl.textContent;
    if (!css || !/prefers-color-scheme/i.test(css)) {
      return;
    }
    styleEl.textContent = css.replace(
      /\(\s*prefers-color-scheme\s*:\s*dark\s*\)/gi,
      '(prefers-color-scheme-disabled: dark)'
    );
  });
}

// Email-compatible allowed tags- comprehensive list for proper email rendering
const EMAIL_ALLOWED_TAGS = [
  // Text formatting
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'strike',
  'del',
  'ins',
  'mark',
  'small',
  'big',
  'sub',
  'sup',
  'font',
  'center',
  // Headings
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  // Structure
  'div',
  'span',
  'section',
  'article',
  'header',
  'footer',
  'main',
  'aside',
  'nav',
  // Lists
  'ul',
  'ol',
  'li',
  'dl',
  'dt',
  'dd',
  // Tables (full support for email layouts)
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'td',
  'th',
  'caption',
  'colgroup',
  'col',
  // Media
  'img',
  'figure',
  'figcaption',
  // Other common elements
  'a',
  'blockquote',
  'pre',
  'code',
  'hr',
  'address',
  'cite',
  'q',
  // Styles (needed for email CSS)
  'style',
];

// Email-compatible allowed attributes - includes table layout attributes common in emails
const EMAIL_ALLOWED_ATTR = [
  // Links and images
  'href',
  'src',
  'alt',
  'title',
  // Styling
  'class',
  'style',
  'id',
  // Link behavior
  'target',
  'rel',
  // Table layout attributes (heavily used in email HTML)
  'width',
  'height',
  'align',
  'valign',
  'bgcolor',
  'background',
  'border',
  'cellpadding',
  'cellspacing',
  'colspan',
  'rowspan',
  // Font attributes (legacy but common in emails)
  'color',
  'size',
  'face',
];

/** Minimal attachment shape needed to resolve inline CID images. */
export interface InlineAttachmentRef {
  contentId?: string;
  mimeType: string;
  inlineData?: string;
}

/**
 * A schemeless external URL: a `www.`-prefixed host, or a dotted host followed
 * by a path/query/fragment/port (e.g. `google.com/maps?...`). These are NOT
 * relative paths — an email author meant an external site but omitted the
 * scheme. Left as-is, the browser resolves them against the current page
 * (`app.bearlymail.com/email/…`), breaking the link (issue: Google Maps link
 * became `app.bearlymail.com/email/google.com/maps?...`).
 *
 * Deliberately does NOT match: `mailto:`/`tel:`/`#anchor`/`/root-relative`
 * (no leading dotted host), or a bare dotted token with no path such as
 * `report.html` (avoids treating a relative filename as a host).
 */
const SCHEMELESS_EXTERNAL_HREF = /^(?:www\.|[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:[/?#]|:\d))/i;

/**
 * Prepend `https://` to a schemeless external href so it resolves absolutely.
 * Returns null when the href already has a scheme, is an anchor/mailto/tel, is
 * protocol-relative (`//host`), or is a genuine relative path — leave those be.
 */
export function normalizeSchemelessExternalHref(href: string): string | null {
  const trimmed = href.trim();
  if (
    // Already has a URL scheme (http:, mailto:, tel:, cid:, data:…). Scheme
    // chars exclude '.', so a `host.tld:port` (which has a dot before the colon)
    // is NOT mistaken for a scheme and still gets normalized below.
    /^[a-z][a-z0-9+-]*:/i.test(trimmed) ||
    trimmed.startsWith('//') || // protocol-relative
    trimmed.startsWith('#') ||
    trimmed.startsWith('/')
  ) {
    return null;
  }
  return SCHEMELESS_EXTERNAL_HREF.test(trimmed) ? `https://${trimmed}` : null;
}

/**
 * Helper function to sanitize and process HTML for safe rendering
 * This function sanitizes first (for XSS protection), then adds target="_blank" to links.
 *
 * Pass `attachments` to resolve inline CID images (cid:xxx) to data: URIs using embedded
 * attachment data. Inline images without a matching attachment are removed.
 */
export function sanitizeAndProcessHtml(html: string, attachments?: InlineAttachmentRef[]): string {
  if (!html) {
    return '';
  }

  // Step 1: Sanitize the HTML first to prevent XSS attacks
  // DOMPurify removes dangerous content and attributes
  const sanitized = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: EMAIL_ALLOWED_TAGS,
    ALLOWED_ATTR: EMAIL_ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    // Prevent javascript: and data: URLs in href/src
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'select', 'textarea', 'use'],
    FORBID_ATTR: [
      'onerror',
      'onload',
      'onclick',
      'onmouseover',
      'onfocus',
      'onblur',
      'onsubmit',
      'onchange',
      'xlink:href',
    ],
  });

  // Step 2: Resolve or remove inline CID images at the STRING level before
  // setting innerHTML. Browsers start loading image resources as soon as
  // innerHTML is parsed — even for detached elements — so cid: references
  // must be replaced or stripped in the string first to prevent
  // net::ERR_UNKNOWN_URL_SCHEME errors in the console.
  const resolvedHtml = sanitized.replace(
    /<img([^>]*?)src=(["'])cid:([^"']*)\2([^>]*?)>/gi,
    (_match, before, quote, cid, after) => {
      const attachment = attachments?.find(att => att.contentId === cid && att.inlineData);
      if (attachment) {
        return `<img${before}src=${quote}data:${attachment.mimeType};base64,${attachment.inlineData}${quote}${after}>`;
      }
      return ''; // strip unresolvable cid: images
    }
  );

  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = resolvedHtml;

  // Remove avatar images entirely - they're small profile pics that look bad when expanded
  const avatarImages = tempDiv.querySelectorAll('img[src*="avatars.githubusercontent.com"]');
  avatarImages.forEach(img => img.remove());

  // Defuse the email's own dark-mode CSS so it can't paint dark backgrounds over the light UI
  neutralizeDarkModeStyles(tempDiv);

  // Step 3: Auto-linkify plain URLs in text nodes that aren't already inside <a> tags
  linkifyTextNodes(tempDiv);

  // Step 4: Normalize schemeless external links to absolute https:// (so they
  // don't resolve against app.bearlymail.com), then add target/rel to links
  // that open externally.
  const links = tempDiv.querySelectorAll('a[href]');
  links.forEach(link => {
    let href = link.getAttribute('href');
    if (!href) {
      return;
    }
    const normalized = normalizeSchemelessExternalHref(href);
    if (normalized) {
      link.setAttribute('href', normalized);
      href = normalized;
    }
    if (href.startsWith('http://') || href.startsWith('https://')) {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    }
  });

  return tempDiv.innerHTML;
}

/**
 * Decode HTML entities (e.g. `&mdash;`, `&amp;`, `&#39;`) into their literal characters
 * for plain-text display contexts (previews, summaries). Parses safely via DOMParser so no
 * tags are interpreted and no network requests fire. Returns the input unchanged when it
 * contains no entities.
 */
export function decodeHtmlEntities(text: string): string {
  if (!text || !text.includes('&')) {
    return text;
  }
  const doc = new DOMParser().parseFromString(text, 'text/html');
  return doc.body.textContent || text;
}

/**
 * Strip HTML tags from a string, returning plain text.
 * Used for display contexts where raw HTML should not be shown (e.g. email previews).
 * Preserves semantic line breaks from block elements (p, div, br, etc.).
 */
export function stripHtmlTags(html: string): string {
  if (!html) {
    return '';
  }
  // No tags, but the text may still carry HTML entities (e.g. a plain-text part that
  // encoded "—" as "&mdash;") — decode those rather than returning them verbatim.
  if (!html.includes('<')) {
    return decodeHtmlEntities(html);
  }

  // Replace block-level elements and line breaks with newlines before extracting text
  // This preserves semantic line breaks from HTML structure
  const processed = html
    // Handle <br> tags first
    .replace(/<br\s*\/?>/gi, '\n')
    // Add newline after closing block-level tags to preserve paragraph breaks
    .replace(/<\/(p|div|li|h[1-6]|blockquote|tr)>/gi, '</$1>\n')
    // Add newline before opening block-level tags (trimmed at end to handle leading newline)
    .replace(/(<(p|div|li|h[1-6]|blockquote|tr)\b[^>]*>)/gi, '\n$1');

  // Parse safely to prevent triggering network requests (e.g., tracking pixels from <img> tags)
  const doc = new DOMParser().parseFromString(processed, 'text/html');
  const text = doc.body.textContent || doc.body.innerText || '';

  // Clean up excessive whitespace while preserving single newlines
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Extract clean body from email (removes quoted content and signatures).
 * Returns both the cleaned text and whether content was truncated.
 */
export function extractCleanBodyWithMeta(emailBody: string, htmlBody?: string): CleanBodyResult {
  if (!emailBody && !htmlBody) {
    return { text: '', wasTruncated: false };
  }

  let content = emailBody || '';

  if (content.includes('<')) {
    const cleanedContent = removeCidImagesFromString(content);
    const doc = new DOMParser().parseFromString(cleanedContent, 'text/html');
    content = doc.body.textContent || doc.body.innerText || '';
  } else if (htmlBody && !emailBody) {
    const cleanedHtml = removeCidImagesFromString(htmlBody);
    const doc = new DOMParser().parseFromString(cleanedHtml, 'text/html');
    content = doc.body.textContent || doc.body.innerText || '';
  }

  const boundaryPatterns = [
    /On\s+\w+,\s+\d{1,2}\s+\w+\s+\d{4}\s+at\s+\d{1,2}:\d{2}.*?wrote:/i,
    /On\s+\w+,\s+\d{1,2}\s+\w+\s+\d{4}.*?wrote:/i,
    /From:\s+.*?<.*?@.*?>\s+Sent:\s+.*?Subject:/i,
    /-----Original Message-----/i,
  ];

  let cutoffIndex = content.length;
  for (const pattern of boundaryPatterns) {
    const match = content.search(pattern);
    if (match > MIN_CONTENT_BEFORE_BOUNDARY && match < cutoffIndex) {
      cutoffIndex = match;
    }
  }

  let wasTruncated = false;
  if (cutoffIndex < content.length) {
    const cleaned = content.substring(0, cutoffIndex).trim();
    if (cleaned.length > MIN_CONTENT_BEFORE_BOUNDARY) {
      content = cleaned;
      wasTruncated = true;
    }
  }

  // Remove any remaining quoted lines (lines starting with >)
  const beforeQuoteRemoval = content;
  content = content.replace(/^>+.*$/gm, '');
  if (content !== beforeQuoteRemoval) {
    wasTruncated = true;
  }

  // Remove signatures
  content = removeSignature(content, false);

  return { text: content.replace(/\n{3,}/g, '\n\n').trim(), wasTruncated };
}

/**
 * Extract clean body from email (removes quoted content and signatures)
 */
export function extractCleanBody(emailBody: string, htmlBody?: string): string {
  return extractCleanBodyWithMeta(emailBody, htmlBody).text;
}
