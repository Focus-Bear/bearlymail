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
    tempDiv.innerHTML = content;
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
 * Helper function to clean HTML body by removing quoted/forwarded email content
 */
export function extractCleanHtmlBody(htmlBody: string): string {
  if (!htmlBody) return '';
  
  // Convert to text to find boundary markers
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlBody;
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
      // Find the end of the current content (before the quoted part)
      // Look backwards from the boundary to find a good cut point
      let cutPoint = htmlPos + searchText.length;
      // Try to cut at a tag boundary or whitespace
      const beforeCut = htmlBody.substring(0, cutPoint);
      const lastTagEnd = beforeCut.lastIndexOf('>');
      const lastNewline = beforeCut.lastIndexOf('\n');
      if (lastTagEnd > cutPoint - HTML_CUT_POINT_OFFSET_100) {
        cutPoint = lastTagEnd + 1;
      } else if (lastNewline > cutPoint - HTML_CUT_POINT_OFFSET_50) {
        cutPoint = lastNewline;
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

/**
 * Process GitHub image links to display images inline
 * GitHub emails often have links like "image.png (view on web)" that should be converted to actual images
 */
function processGitHubImages(html: string): string {
  if (!html) return '';
  
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  
  // Find links that look like GitHub image references
  // Pattern: links containing "image" and "(view on web)" or similar
  const links = Array.from(tempDiv.querySelectorAll('a[href]'));
  
  let processedCount = 0;
  
  links.forEach((link) => {
    const href = link.getAttribute('href');
    const linkText = (link.textContent || '').trim();
    
    // Skip avatar images - don't expand these
    if (href && href.includes('avatars.githubusercontent.com')) {
      return;
    }
    
    // Skip if the link contains an img tag that's marked to skip
    const imgInLink = link.querySelector('img[data-skip-processing="true"]');
    if (imgInLink) {
      return;
    }
    
    // Check if this looks like a GitHub image link
    // GitHub image links often have patterns like:
    // - "image.png (view on web)" or "Screenshot.png (view on web)" - any filename with image extension
    // - Links to github.com/user-attachments/assets/ (GitHub user attachments)
    // - Links to github.com with image references
    // - Links containing "notifications/beacon" (GitHub notification tracking)
    const hasImageFileName = linkText.match(/\.(png|jpg|jpeg|gif|webp|svg)\s*\(view\s+on\s+web\)/i);
    const hasViewOnWeb = linkText.match(/view\s+on\s+web/i); // Match "view on web" with any whitespace
    const isGitHubImageUrl = href && (
      (href.includes('github.com') && (
        href.includes('/images/') ||
        href.includes('notifications/beacon') ||
        href.includes('user-attachments/assets/') || // GitHub user attachment URLs
        href.match(/\.(png|jpg|jpeg|gif|webp|svg)(\?|$)/i) ||
        href.match(/\/issues\/\d+\/images\//) ||
        href.match(/\/pull\/\d+\/images\//)
      ))
    );
    
    // Match if: (has image filename with "view on web") OR (has "view on web" AND GitHub URL) OR (GitHub image URL)
    const isImageLink = hasImageFileName || (hasViewOnWeb && href?.includes('github.com')) || isGitHubImageUrl;
    
    if (isImageLink && href) {
      // Extract the actual image URL
      // GitHub notification emails often use tracking URLs that redirect to the actual image
      // The browser will automatically follow redirects for img src
      let imageUrl = href;
      
      // If it's a notification beacon URL, it will redirect to the actual image
      // The browser handles this automatically
      if (href.includes('notifications/beacon')) {
        // Keep the beacon URL - browser will follow redirect
        imageUrl = href;
      } else if (href.match(/\.(png|jpg|jpeg|gif|webp|svg)(\?|$)/i)) {
        // Direct image URL
        imageUrl = href;
      } else if (href.includes('github.com')) {
        // GitHub link that should point to an image
        imageUrl = href;
      }
      
      // Create an img element wrapped in a link
      const img = document.createElement('img');
      img.src = imageUrl;
      img.alt = linkText.replace(/\s*\(view on web\)/i, '').trim() || 'GitHub image';
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      img.style.display = 'block';
      img.style.borderRadius = '4px';
      img.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
      
      // Wrap image in a link so users can click to view full size
      const imageLink = document.createElement('a');
      imageLink.href = href;
      imageLink.target = '_blank';
      imageLink.rel = 'noopener noreferrer';
      imageLink.style.display = 'block';
      imageLink.style.margin = '10px 0';
      imageLink.style.textDecoration = 'none';
      imageLink.title = 'Click to view full size';
      imageLink.appendChild(img);
      
      // Replace the original link with the new image link
      if (link.parentNode) {
        link.parentNode.replaceChild(imageLink, link);
        processedCount++;
      }
    }
  });
  
  return tempDiv.innerHTML;
}

// Email-compatible allowed tags - comprehensive list for proper email rendering
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
 * and processes GitHub images to display inline
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
  
  // Step 1.5: Remove problematic images
  const tempDivForAvatars = document.createElement('div');
  tempDivForAvatars.innerHTML = sanitized;
  
  // Remove all images with cid: URLs (embedded email images that can't be resolved)
  const cidImages = tempDivForAvatars.querySelectorAll('img[src^="cid:"]');
  cidImages.forEach((img) => img.remove());
  
  // Remove avatar images entirely - they're small profile pics that look bad when expanded
  const avatarImages = tempDivForAvatars.querySelectorAll('img[src*="avatars.githubusercontent.com"]');
  avatarImages.forEach((img) => img.remove());
  
  // Step 2: Process GitHub images to display inline
  const withImages = processGitHubImages(tempDivForAvatars.innerHTML);
  
  // Step 3: Process links to add target="_blank" and rel="noopener noreferrer"
  // Reuse tempDivForAvatars for processing links
  tempDivForAvatars.innerHTML = withImages;
  
  // Find all links and add target="_blank" and rel="noopener noreferrer"
  const links = tempDivForAvatars.querySelectorAll('a[href]');
  links.forEach((link) => {
    const href = link.getAttribute('href');
    // Only add target="_blank" for http/https links (not mailto:, tel:, etc.)
    if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    }
  });
  
  return tempDivForAvatars.innerHTML;
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
    tempDiv.innerHTML = htmlBody;
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



