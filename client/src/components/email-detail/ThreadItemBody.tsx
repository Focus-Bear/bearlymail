import React from 'react';
import { theme } from 'theme/theme';
import { extractCleanHtmlBody, removeSignature, sanitizeAndProcessHtml } from 'utils/emailBodyUtils';

import { EmailBodyIframe } from './EmailBodyIframe';

interface ThreadItemBodyProps {
  body: string;
  htmlBody?: string;
}

export const ThreadItemBody: React.FC<ThreadItemBodyProps> = ({ body, htmlBody }) => {
  const isHtml = Boolean(htmlBody);
  const processedContent = htmlBody
    ? sanitizeAndProcessHtml(extractCleanHtmlBody(removeSignature(htmlBody)))
    : removeSignature(body || '');

  // Plain-text path: use whiteSpace: pre-wrap to preserve \n newlines
  return (
    <div
      style={{
        padding: theme.spacing.md,
        backgroundColor: theme.colors.background.paper,
        borderTop: `1px solid ${theme.colors.border.light}`,
        overflowX: 'auto',
      }}
    >
      {isHtml ? (
        <EmailBodyIframe html={processedContent} />
      ) : (
        <div
          style={{
            color: theme.colors.text.primary,
            lineHeight: 1.8,
            whiteSpace: 'pre-wrap',
            overflowX: 'auto',
          }}
        >
          {processedContent}
        </div>
      )}
    </div>
  );
};
