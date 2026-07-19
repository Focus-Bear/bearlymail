import './sanitizeHooks';

import DOMPurify from 'dompurify';

import { NODE_NAME_ANCHOR } from 'constants/strings';

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
      timestamp: email.receivedAt,
    };
  }

  const isFromCurrentUser = email.from?.toLowerCase() === normalizedUserEmail;

  if (!isFromCurrentUser) {
    return {
      name: email.fromName || email.from || '',
      email: email.from || '',
      timestamp: email.receivedAt,
    };
  }

  if (threadEmails.length > 0) {
    const emailFromOther = threadEmails.find(event => event.from?.toLowerCase() !== normalizedUserEmail);
    if (emailFromOther) {
      return {
        name: emailFromOther.fromName || emailFromOther.from || '',
        email: emailFromOther.from || '',
        timestamp: emailFromOther.receivedAt,
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
    timestamp: email.receivedAt,
  };
};

/**
 * Extract email address from a "from" field.
 * Handles formats like "Name <email@example.com>" or just "email@example.com"
 */
export const extractEmailAddress = (from: string | undefined): string => {
  if (!from) {
    return '';
  }
  const match = from.match(/<([^>]+)>/);
  if (match) {
    return match[1].toLowerCase().trim();
  }
  return from.toLowerCase().trim();
};

/**
 * Removes email signatures from text
 */
export const removeSignature = (text: string): string => {
  if (!text) {
    return '';
  }

  const patterns = [
    /^--\s*$/m,
    /^Best regards,?$/im,
    /^Sent from .+$/im,
    /^On .+ wrote:?$/im,
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
 * Aligns with server `reply-plaintext-format.util.ts`: fixes run-on AI replies, strips a
 * trailing encryption blob if it was mistaken for a sign-off name (stale suggestions).
 */
export const normalizeAiReplyPlaintext = (raw: string): string => {
  let text = raw.trim();
  if (!text) {
    return text;
  }

  text = text
    .replace(/\\r\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\\n/g, '\n');

  const trailingCipher = /,?\s*[0-9a-f]{32}:[0-9a-f]{32}:[0-9a-f]+$/i;
  text = text.replace(trailingCipher, match => (match.startsWith(',') ? ',' : ''));

  const linesWithContent = text.split('\n').filter(line => line.trim().length > 0);
  if (linesWithContent.length >= 2) {
    return text.trimEnd();
  }

  text = text.replace(/^((?:Hi|Hello|Hey|Dear)\s+[^,\n]+),\s+/i, '$1,\n\n');

  const closingAfterPunct = new RegExp(
    '([.!?])\\s+((?:cheers|best regards|kind regards|warm regards|warmly|sincerely|yours truly|many thanks))\\s*,',
    'gi'
  );
  text = text.replace(closingAfterPunct, '$1\n\n$2,');

  if (!text.includes('\n')) {
    text = text.replace(
      /\s+((?:cheers|best regards|kind regards|warm regards|warmly|sincerely|yours truly|many thanks))\s*,\s*/gi,
      '\n\n$1,\n'
    );
  }

  return text.trimEnd();
};

/**
 * Sanitizes and processes HTML for safe rendering
 */
export const plainTextToHtml = (text: string): string => {
  if (!text) {
    return '';
  }
  if (text.startsWith('<') && (text.includes('<p>') || text.includes('<br') || text.includes('<div'))) {
    return text;
  }
  // Normalize escaped newline sequences (e.g., "\\n" -> actual newline) so that LLMs
  // that return escaped newlines render correctly.
  const normalized = text
    .replace(/\\r\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\\n/g, '\n');
  const paragraphs = normalized.split(/\n\n+/);
  return paragraphs.map(para => `<p>${para.replace(/\n/g, '<br>')}</p>`).join('');
};

const PLAIN_URL_REGEX = /https?:\/\/[^\s<>"'`,;!?\])}]+(?:[/?#][^\s<>"'`,;!?\])}]*)?/g;

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

function buildLinkFragment(text: string): { fragment: DocumentFragment; replaced: boolean } {
  const fragment = document.createDocumentFragment();
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = PLAIN_URL_REGEX.exec(text)) !== null) {
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

  return { fragment, replaced: lastIndex > 0 };
}

function linkifyPlainUrls(root: HTMLElement): void {
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
    if (!PLAIN_URL_REGEX.test(text)) {
      continue;
    }
    PLAIN_URL_REGEX.lastIndex = 0;

    const { fragment, replaced } = buildLinkFragment(text);
    if (replaced) {
      textNode.parentNode?.replaceChild(fragment, textNode);
    }
  }
}
export const sanitizeAndProcessHtml = (html: string): string => {
  if (!html) {
    return '';
  }

  // Step 1: Sanitize the HTML first to prevent XSS attacks
  const sanitized = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p',
      'br',
      'strong',
      'em',
      'u',
      'a',
      'ul',
      'ol',
      'li',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'div',
      'span',
      'img',
      'table',
      'tr',
      'td',
      'th',
      'style',
      'blockquote',
    ],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'class', 'style', 'scoped', 'target', 'rel'],
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'use'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'xlink:href'],
  });

  // Step 2: Auto-linkify plain URLs in text nodes that aren't already inside <a> tags
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = sanitized;
  linkifyPlainUrls(tempDiv);

  // Step 3: Process links to add target="_blank" and rel="noopener noreferrer"
  const links = tempDiv.querySelectorAll('a[href]');
  links.forEach(link => {
    const href = link.getAttribute('href');
    if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    }
  });

  return tempDiv.innerHTML;
};
