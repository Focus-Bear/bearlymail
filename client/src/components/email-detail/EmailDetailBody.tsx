import React from 'react';
import DOMPurify from 'dompurify';
import { theme } from 'theme/theme';

interface EmailDetailBodyProps {
  body: string;
  htmlBody?: string;
}

/**
 * Email detail body component
 * Displays sanitized email body content
 */
export const EmailDetailBody: React.FC<EmailDetailBodyProps> = ({ body, htmlBody }) => {
  const removeSignature = (text: string): string => {
    if (!text) return '';

    const patterns = [
      /^--\s*$/m,
      /^Best regards,?$/mi,
      /^Sent from .+$/mi,
      /^On .+ wrote:?$/mi,
      /\n-{3,}\n/,
      /RMIT University/i,
      /getoutline\.org/i,
    ];

    let signatureStart = text.length;
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match.index !== undefined && match.index < signatureStart) {
        signatureStart = match.index;
      }
    }

    return text.substring(0, signatureStart).trim();
  };

  // Helper function to sanitize and process HTML for safe rendering
  const sanitizeAndProcessHtml = (html: string): string => {
    if (!html) return '';
    
    // Step 1: Sanitize the HTML first to prevent XSS attacks
    const sanitized = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'div', 'span', 'img', 'table', 'tr', 'td', 'th', 'style', 'blockquote'],
      ALLOWED_ATTR: ['href', 'src', 'alt', 'class', 'style', 'scoped', 'target', 'rel'],
      ALLOW_DATA_ATTR: false,
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
    });
    
    // Step 2: Process links to add target="_blank" and rel="noopener noreferrer"
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = sanitized;
    
    const links = tempDiv.querySelectorAll('a[href]');
    links.forEach((link) => {
      const href = link.getAttribute('href');
      if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener noreferrer');
      }
    });
    
    return tempDiv.innerHTML;
  };

  return (
    <div
      style={{
        backgroundColor: theme.colors.background.paper,
        padding: theme.spacing.xl,
        borderRadius: theme.borderRadius.md,
        border: `1px solid ${theme.colors.border.light}`,
      }}
    >
      <div
        dangerouslySetInnerHTML={{
          __html: htmlBody
            ? sanitizeAndProcessHtml(removeSignature(htmlBody))
            : removeSignature(body || ''),
        }}
        style={{
          color: theme.colors.text.primary,
          lineHeight: 1.8,
        }}
      />
    </div>
  );
};

