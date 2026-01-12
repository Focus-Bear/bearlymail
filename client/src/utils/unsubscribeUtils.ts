/**
 * Utility functions for extracting unsubscribe links from emails
 */

/**
 * Extracts unsubscribe link from email HTML or plain text
 * Looks for common unsubscribe patterns in links and text
 * 
 * @param htmlBody - HTML content of the email (optional)
 * @param body - Plain text content of the email (optional)
 * @returns The first valid unsubscribe URL found, or null if none found
 */
export function extractUnsubscribeLink(
  htmlBody?: string | null,
  body?: string | null,
): string | null {
  // Common unsubscribe patterns to search for
  const unsubscribePatterns = [
    /unsubscribe/i,
    /opt[-\s]?out/i,
    /preferences/i,
    /manage\s+subscription/i,
    /email\s+preferences/i,
    /update\s+preferences/i,
    /subscription\s+preferences/i,
    /manage\s+your\s+subscription/i,
    /unsubscribe\s+from\s+this\s+list/i,
  ];

  // First, try to extract from HTML body
  if (htmlBody) {
    // Sanitize HTML to prevent browser from loading embedded resources (cid: URLs, images, etc.)
    // Remove or neutralize elements that trigger resource loading
    const sanitizedHtml = htmlBody
      // Remove image tags that might have cid: URLs
      .replace(/<img[^>]*>/gi, '')
      // Remove style tags that might reference cid: URLs
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      // Replace cid: URLs in src/href attributes with empty strings to prevent loading
      .replace(/(src|href)=["']cid:[^"']*["']/gi, '$1=""')
      // Remove background images with cid: URLs
      .replace(/background[^:]*:\s*url\(["']?cid:[^"')]*["']?\)/gi, '');

    // Create a temporary DOM element to parse HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = sanitizedHtml;

    // Find all links in the HTML
    const links = tempDiv.querySelectorAll('a[href]');
    
    for (const link of Array.from(links)) {
      const href = link.getAttribute('href');
      const text = link.textContent || '';
      
      if (!href) continue;

      // Check if link text or href matches unsubscribe patterns
      const matchesPattern = unsubscribePatterns.some(pattern => 
        pattern.test(text) || pattern.test(href)
      );

      if (matchesPattern) {
        // Clean up the URL (remove mailto: prefix if present, handle relative URLs)
        const url = href.trim();
        
        // Skip mailto: links
        if (url.startsWith('mailto:')) {
          continue;
        }

        // If it's a relative URL, try to make it absolute (though we can't know the base URL)
        // For now, return as-is and let the browser handle it
        if (url.startsWith('http://') || url.startsWith('https://')) {
          return url;
        }
        
        // For relative URLs, return them as-is (they might work if the email provider handles them)
        if (url.startsWith('/') || url.startsWith('./') || url.startsWith('../')) {
          return url;
        }
      }
    }

    // Also search in HTML text content for plain URLs
    const htmlText = tempDiv.textContent || '';
    const urlPattern = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/gi;
    const urls = htmlText.match(urlPattern) || [];
    
    for (const url of urls) {
      const urlLower = url.toLowerCase();
      if (unsubscribePatterns.some(pattern => pattern.test(urlLower))) {
        return url;
      }
    }
  }

  // Fallback: search in plain text body
  if (body) {
    // Look for URLs in plain text that match unsubscribe patterns
    const urlPattern = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/gi;
    const urls = body.match(urlPattern) || [];
    
    for (const url of urls) {
      const urlLower = url.toLowerCase();
      if (unsubscribePatterns.some(pattern => pattern.test(urlLower))) {
        return url;
      }
    }

    // Also look for text patterns followed by URLs on the same or next line
    const lines = body.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const nextLine = lines[i + 1] || '';
      
      const matchesPattern = unsubscribePatterns.some(pattern => pattern.test(line));
      
      if (matchesPattern) {
        // Check current line for URL
        const urlMatch = line.match(urlPattern);
        if (urlMatch && urlMatch[0]) {
          return urlMatch[0];
        }
        
        // Check next line for URL
        const nextUrlMatch = nextLine.match(urlPattern);
        if (nextUrlMatch && nextUrlMatch[0]) {
          return nextUrlMatch[0];
        }
      }
    }
  }

  return null;
}

