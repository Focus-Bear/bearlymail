import React from 'react';
import { theme } from 'theme/theme';
import { removeSignature, sanitizeAndProcessHtml } from 'utils/emailUtils';

interface ThreadItemBodyProps {
  body: string;
  htmlBody?: string;
}

export const ThreadItemBody: React.FC<ThreadItemBodyProps> = ({
  body,
  htmlBody,
}) => {
  const processedContent = htmlBody
    ? sanitizeAndProcessHtml(removeSignature(htmlBody))
    : removeSignature(body || '');

  return (
    <div
      style={{
        padding: theme.spacing.md,
        backgroundColor: theme.colors.background.paper,
        borderTop: `1px solid ${theme.colors.border.light}`,
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






