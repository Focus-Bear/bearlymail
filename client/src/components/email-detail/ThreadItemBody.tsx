import React from 'react';
import { theme } from 'theme/theme';
import { extractCleanHtmlBody, removeSignature, sanitizeAndProcessHtml } from 'utils/emailBodyUtils';

import { EmailBodyIframe } from './EmailBodyIframe';

interface ThreadItemBodyProps {
  body: string;
  htmlBody?: string;
}

export const ThreadItemBody: React.FC<ThreadItemBodyProps> = ({ body, htmlBody }) => {
  if (htmlBody) {
    const processedContent = sanitizeAndProcessHtml(extractCleanHtmlBody(removeSignature(htmlBody)));
    return (
      <div
        style={{
          padding: theme.spacing.md,
          backgroundColor: theme.colors.background.paper,
          borderTop: `1px solid ${theme.colors.border.light}`,
          overflowX: 'auto',
        }}
      >
        <EmailBodyIframe html={processedContent} />
      </div>
    );
  }

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
    </div>
  );
};
