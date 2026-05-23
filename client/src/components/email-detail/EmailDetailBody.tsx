import React from 'react';
import { theme } from 'theme/theme';
import { extractCleanHtmlBody, InlineAttachmentRef, looksLikeHtml, removeSignature, sanitizeAndProcessHtml } from 'utils/emailBodyUtils';

import { EmailBodyIframe } from './EmailBodyIframe';

interface EmailDetailBodyProps {
  body: string;
  htmlBody?: string;
  attachments?: InlineAttachmentRef[];
}

/**
 * Email detail body component
 * Displays sanitized email body content inside an isolated iframe
 */
export const EmailDetailBody: React.FC<EmailDetailBodyProps> = ({ body, htmlBody, attachments }) => {
  const effectiveHtmlBody = htmlBody || (looksLikeHtml(body || '') ? body : undefined);

  return (
    <div
      style={{
        backgroundColor: theme.colors.background.paper,
        padding: theme.spacing.xl,
        borderRadius: theme.borderRadius.md,
        border: `1px solid ${theme.colors.border.light}`,
      }}
    >
      {effectiveHtmlBody ? (
        <EmailBodyIframe html={sanitizeAndProcessHtml(extractCleanHtmlBody(removeSignature(effectiveHtmlBody, true)), attachments)} />
      ) : (
        <div
          style={{
            color: theme.colors.text.primary,
            lineHeight: 1.8,
            whiteSpace: 'pre-wrap',
            overflowX: 'auto',
          }}
        >
          {removeSignature(body || '', false)}
        </div>
      )}
    </div>
  );
};
