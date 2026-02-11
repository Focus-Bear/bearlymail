import DOMPurify from 'dompurify';
import {
  SIGNATURE_MIN_CONTENT_CHARS,
  TEXT_SEARCH_LAST_CHARS,
  MIN_CONTENT_BEFORE_BOUNDARY,
  HTML_CUT_POINT_OFFSET_100,
  HTML_CUT_POINT_OFFSET_50,
  BLOCKQUOTE_MIN_POSITION,
  SIGNATURE_MIN_CONTENT_PLAINTEXT,
  MIN_CONTENT_BEFORE_BOUNDARY_LESS_AGGRESSIVE,
} from 'constants/numbers';
import { NODE_NAME_ANCHOR } from 'constants/strings';

/**
 * Remove email signature from text (works for both plain text and HTML)
 */
// eslint-disable-next-line complexity, max-statements -- Signature detection requires complex logic to handle various email formats and edge cases
export function removeSignature(content: string, isHtml: boolean = false): string {
  if (!content) return '';
  
  if (isHtml) {
    // For HTML, look for signature patterns directly in HTML structure
    const htmlSignaturePatterns = [
      // Look for structured signatures like RMIT with privacy statements
      /(<div[^>]*>[\s\S]*?(?:RESEARCH CONTRACTS|Privacy Statement|www\.rmit\.edu\.au|RMIT values your privacy)[\s\S]*?<\/div>)/i,
      // Look for signature blocks with common closings
      /(<p[^>]*>[\s\S]*?(?:Best regards|Kind regards|Regards|Thanks|Thank you|Cheers|Sincerely|Yours truly|Warm regards|Best|All the best)[\s\S]*?<\/p>)/i,
      // Look for signature dividers
      /(<div[^>]*>[\s\S]*?--\s*<\/div>)/i,
      /(<p[^>]*>[\s\S]*?--\s*<\/p>)/i,
      // Look for mobile signatures
      /(<div[^>]*>[\s\S]*?(?:Sent from my|Get Outlook for|Sent from Mail|Sent from iPhone|Sent from iPad)[\s\S]*?<\/div>)/i,
    ];
    
    let cutoffIndex = content.length;
    
    for (const pattern of htmlSignaturePatterns) {
      const match = content.match(pattern);
      if (match && match.index !== undefined) {
        const index = match.index;
        // Only cut if there's meaningful content before (at least 200 chars)
        if (index > SIGNATURE_MIN_CONTENT_CHARS && index < cutoffIndex) {
          cutoffIndex = index;
        }
      }
    }
    
    // Also check plain text representation for additional patterns
    const tempDiv = document.createElement('div');
    // Remove cid: images before parsing to prevent browser from trying to load them
    tempDiv.innerHTML = removeCidImagesFromString(content);
    const text = tempDiv.textContent || tempDiv.innerText || '';
    
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
        // Find the corresponding position in HTML (approximate)
        const textBeforeSig = text.substring(0, match.index);
        const htmlPos = content.indexOf(textBeforeSig.slice(-TEXT_SEARCH_LAST_CHARS)); // Look for last 100 chars of text
        if (htmlPos > SIGNATURE_MIN_CONTENT_CHARS && htmlPos < cutoffIndex) {
          cutoffIndex = htmlPos;
        }
      }
    }
    
    if (cutoffIndex < content.length) {
      return content.substring(0, cutoffIndex).trim();
    }
    
    return content;
  } else {
    // Plain text signature removal
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
      if (match && match.index !== undefined) {
        const index = match.index;
        if (index > SIGNATURE_MIN_CONTENT_PLAINTEXT && index < cutoffIndex) {
          cutoffIndex = index;
        }
      }
    }
    
    if (cutoffIndex < content.length) {
      return content.substring(0, cutoffIndex).trim();
    }
  }
  
  return content;
}

/**
 * Remove cid: image URLs from HTML string before DOM parsing
 * This prevents the browser from attempting to load embedded email images
 */
function removeCidImagesFromString(html: string): string {
  if (!html) return '';
  return html.replace(/<img[^>]*src=["']cid:[^"']*["'][^>]*>/gi, '');
}

/**
 * Helper function to clean HTML body by removing quoted/forwarded email content
 */
export function extractCleanHtmlBody(htmlBody: string): string {
  if (!htmlBody) return '';
  
  // Remove cid: images before parsing to prevent browser from trying to load them
  const cleanedHtml = removeCidImagesFromString(htmlBody);
  
  // Convert to text to find boundary markers
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = cleanedHtml;
  const textContent = tempDiv.textContent || tempDiv.innerText || '';
  
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
  
  // If we found a boundary, find it in the HTML
  if (cutoffIndex < textContent.length) {
    const textBeforeBoundary = textContent.substring(0, cutoffIndex);
    // Find this text in the HTML (look for last 50 chars to be safe)
    const searchText = textBeforeBoundary.slice(-HTML_CUT_POINT_OFFSET_50);
    const htmlPos = htmlBody.indexOf(searchText);
    if (htmlPos > 0) {
      let cutPoint = htmlPos + searchText.length;
      const nextTagStart = htmlBody.indexOf('<', cutPoint);
      if (nextTagStart >= 0 && nextTagStart - cutPoint < HTML_CUT_POINT_OFFSET_100) {
        cutPoint = nextTagStart;
      }
      return htmlBody.substring(0, cutPoint).trim();
    }
  }
  
  // Also check for HTML blockquote tags
  const blockquoteMatch = htmlBody.search(/<blockquote[^>]*>/i);
  if (blockquoteMatch > BLOCKQUOTE_MIN_POSITION) {
    return htmlBody.substring(0, blockquoteMatch).trim();
  }
  
  return htmlBody;
}

const URL_REGEX = /https?:\/\/[^\s<>"'`,;!?\])}]+(?:[/?#][^\s<>"'`,;!?\])}]*)?/g;

function isInsideAnchor(node: Node): boolean {
  let parent = node.parentNode;
  while (parent) {
    if (parent.nodeName === NODE_NAME_ANCHOR) return true;
    parent = parent.parentNode;
  }
  return false;
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
    if (isInsideAnchor(textNode)) continue;
    const text = textNode.nodeValue || '';
    if (!URL_REGEX.test(text)) continue;
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
}

// Email-compatible allowed tags- comprehensive list for proper email rendering
const EMAIL_ALLOWED_TAGS = [
  // Text formatting
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'ins',
  'mark', 'small', 'big', 'sub', 'sup', 'font', 'center',
  // Headings
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  // Structure
  'div', 'span', 'section', 'article', 'header', 'footer', 'main', 'aside', 'nav',
  // Lists
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  // Tables (full support for email layouts)
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'col',
  // Media
  'img', 'figure', 'figcaption',
  // Other common elements
  'a', 'blockquote', 'pre', 'code', 'hr', 'address', 'cite', 'q',
  // Styles (needed for email CSS)
  'style',
];

// Email-compatible allowed attributes - includes table layout attributes common in emails
const EMAIL_ALLOWED_ATTR = [
  // Links and images
  'href', 'src', 'alt', 'title',
  // Styling
  'class', 'style', 'id',
  // Link behavior
  'target', 'rel',
  // Table layout attributes (heavily used in email HTML)
  'width', 'height', 'align', 'valign', 'bgcolor', 'background',
  'border', 'cellpadding', 'cellspacing', 'colspan', 'rowspan',
  // Font attributes (legacy but common in emails)
  'color', 'size', 'face',
];

/**
 * Helper function to sanitize and process HTML for safe rendering
 * This function sanitizes first (for XSS protection), then adds target="_blank" to links
 */
export function sanitizeAndProcessHtml(html: string): string {
  if (!html) return '';
  
  // Step 1: Sanitize the HTML first to prevent XSS attacks
  // DOMPurify removes dangerous content and attributes
  const sanitized = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: EMAIL_ALLOWED_TAGS,
    ALLOWED_ATTR: EMAIL_ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    // Prevent javascript: and data: URLs in href/src
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'select', 'textarea'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'onsubmit', 'onchange'],
  });
  
  // Step 2: Remove problematic images
  // First remove cid: images from string to prevent browser from trying to load them
  const sanitizedWithoutCid = removeCidImagesFromString(sanitized);
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = sanitizedWithoutCid;
  
  // Remove all images with cid: URLs (embedded email images that can't be resolved)
  const cidImages = tempDiv.querySelectorAll('img[src^="cid:"]');
  cidImages.forEach((img) => img.remove());
  
  // Remove avatar images entirely - they're small profile pics that look bad when expanded
  const avatarImages = tempDiv.querySelectorAll('img[src*="avatars.githubusercontent.com"]');
  avatarImages.forEach((img) => img.remove());
  
  // Step 3: Auto-linkify plain URLs in text nodes that aren't already inside <a> tags
  linkifyTextNodes(tempDiv);
  
  // Step 4: Process links to add target="_blank" and rel="noopener noreferrer"
  const links = tempDiv.querySelectorAll('a[href]');
  links.forEach((link) => {
    const href = link.getAttribute('href');
    if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    }
  });
  
  return tempDiv.innerHTML;
}

/**
 * Extract clean body from email (removes quoted content and signatures)
 */
export function extractCleanBody(emailBody: string, htmlBody?: string): string {
  if (!emailBody && !htmlBody) return '';
  
  // Prefer plain text body, fallback to HTML
  let content = emailBody || '';
  
  if (htmlBody && !emailBody) {
    // Convert HTML to text for cleaning
    const tempDiv = document.createElement('div');
    // Remove cid: images before parsing to prevent browser from trying to load them
    tempDiv.innerHTML = removeCidImagesFromString(htmlBody);
    content = tempDiv.textContent || tempDiv.innerText || '';
  }
  
  // Find the boundary where the quoted/forwarded email starts
  // Use simpler, more reliable patterns - be less aggressive
  const boundaryPatterns = [
    // "On [date] at [time] [name] <email> wrote:" - Gmail style (most common)
    /On\s+\w+,\s+\d{1,2}\s+\w+\s+\d{4}\s+at\s+\d{1,2}:\d{2}.*?wrote:/i,
    // "On [date] [name] wrote:" - common pattern
    /On\s+\w+,\s+\d{1,2}\s+\w+\s+\d{4}.*?wrote:/i,
    // "From: [name] <email> Sent: ... Subject: ..."
    /From:\s+.*?<.*?@.*?>\s+Sent:\s+.*?Subject:/i,
    // "-----Original Message-----"
    /-----Original Message-----/i,
  ];
  
  let cutoffIndex = content.length;
  
  for (const pattern of boundaryPatterns) {
    const match = content.search(pattern);
    if (match > 0 && match < cutoffIndex) {
      // Need at least 50 chars of content before boundary (less aggressive)
      if (match > MIN_CONTENT_BEFORE_BOUNDARY_LESS_AGGRESSIVE) {
        cutoffIndex = match;
      }
    }
  }
  
  // If we found a boundary, cut the content there
  if (cutoffIndex < content.length && cutoffIndex > MIN_CONTENT_BEFORE_BOUNDARY_LESS_AGGRESSIVE) {
    const cleaned = content.substring(0, cutoffIndex).trim();
    // Only return cleaned if we have substantial content (at least 50 chars)
    if (cleaned.length > MIN_CONTENT_BEFORE_BOUNDARY_LESS_AGGRESSIVE) {
      content = cleaned;
    }
  }
  
  // Remove any remaining quoted lines (lines starting with >)
  content = content.replace(/^>+.*$/gm, '');
  
  // Remove signatures
  content = removeSignature(content, false);
  
  return content.replace(/\n{3,}/g, '\n\n').trim();
}



