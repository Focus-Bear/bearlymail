import React from 'react';
import { theme } from 'theme/theme';
import { sanitizeAndProcessHtml, removeSignature, extractCleanHtmlBody } from 'utils/emailBodyUtils';
import { EmailBodyIframe } from './EmailBodyIframe';

interface EmailDetailBodyProps {
  body: string;
  htmlBody?: string;
}

/**
 * Email detail body component
 * Displays sanitized email body content inside an isolated iframe
 */
export const EmailDetailBody: React.FC<EmailDetailBodyProps> = ({ body, htmlBody }) => {
  return (
    <div
      style={{
        backgroundColor: theme.colors.background.paper,
        padding: theme.spacing.xl,
        borderRadius: theme.borderRadius.md,
        border: `1px solid ${theme.colors.border.light}`,
      }}
    >
      {htmlBody ? (
        <EmailBodyIframe 
          html={sanitizeAndProcessHtml(extractCleanHtmlBody(removeSignature(htmlBody, true)))}
        />
      ) : (
        <div
          style={{
            color: theme.colors.text.primary,
            lineHeight: 1.8,
            whiteSpace: 'pre-wrap',
          }}
        >
          {removeSignature(body || '', false)}
        </div>
      )}
    </div>
  );
};
