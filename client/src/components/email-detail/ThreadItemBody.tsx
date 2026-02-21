import React from 'react';
import { theme } from 'theme/theme';
import { removeSignature, sanitizeAndProcessHtml, extractCleanHtmlBody } from 'utils/emailBodyUtils';

interface ThreadItemBodyProps {
  body: string;
  htmlBody?: string;
}

export const ThreadItemBody: React.FC<ThreadItemBodyProps> = ({
  body,
  htmlBody,
}) => {
  const processedContent = htmlBody
    ? sanitizeAndProcessHtml(extractCleanHtmlBody(removeSignature(htmlBody)))
    : removeSignature(body || '');

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
        dangerouslySetInnerHTML={{ __html: processedContent }}
        style={{
          color: theme.colors.text.primary,
          lineHeight: 1.6,
        }}
      />
    </div>
  );
};






