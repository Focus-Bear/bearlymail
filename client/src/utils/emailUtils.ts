import DOMPurify from 'dompurify';

interface EmailWithSender {
  from?: string;
  fromName?: string;
  to?: string;
  receivedAt: string;
}

interface Correspondent {
  name: string;
  email: string;
  timestamp: string;
}

export const getCorrespondent = (
  email: EmailWithSender,
  userEmail: string | undefined,
  threadEmails: EmailWithSender[] = []
): Correspondent => {
  const normalizedUserEmail = userEmail?.toLowerCase();
  
  if (!normalizedUserEmail) {
    return { 
      name: email.fromName || email.from || '', 
      email: email.from || '', 
      timestamp: email.receivedAt 
    };
  }

  const isFromCurrentUser = email.from?.toLowerCase() === normalizedUserEmail;

  if (!isFromCurrentUser) {
    return { 
      name: email.fromName || email.from || '', 
      email: email.from || '', 
      timestamp: email.receivedAt 
    };
  }

  if (threadEmails.length > 0) {
    const emailFromOther = threadEmails.find(
      (e) => e.from?.toLowerCase() !== normalizedUserEmail
    );
    if (emailFromOther) {
      return { 
        name: emailFromOther.fromName || emailFromOther.from || '', 
        email: emailFromOther.from || '', 
        timestamp: emailFromOther.receivedAt 
      };
    }
  }

  const toRecipient = email.to;
  if (toRecipient) {
    return { name: toRecipient, email: toRecipient, timestamp: email.receivedAt };
  }

  return { 
    name: email.fromName || email.from || '', 
    email: email.from || '', 
    timestamp: email.receivedAt 
  };
};

/**
 * Removes email signatures from text
 */
export const removeSignature = (text: string): string => {
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

/**
 * Sanitizes and processes HTML for safe rendering
 */
export const sanitizeAndProcessHtml = (html: string): string => {
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






