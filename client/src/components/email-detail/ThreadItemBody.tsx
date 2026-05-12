import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { extractCleanHtmlBody, looksLikeHtml, removeSignature, sanitizeAndProcessHtml } from 'utils/emailBodyUtils';

import { EmailBodyIframe } from './EmailBodyIframe';

interface ThreadItemBodyProps {
  body: string;
  htmlBody?: string;
}

function looksLikeCiphertext(text: string): boolean {
  return /^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]{2,}$/i.test(text.trim());
}

export const ThreadItemBody: React.FC<ThreadItemBodyProps> = ({ body, htmlBody }) => {
  const { t } = useTranslation();

  if (looksLikeCiphertext(body) || (htmlBody != null && looksLikeCiphertext(htmlBody))) {
    return (
      <div
        style={{
          padding: theme.spacing.md,
          backgroundColor: theme.colors.background.paper,
          borderTop: `1px solid ${theme.colors.border.light}`,
          color: theme.colors.text.secondary,
        }}
      >
        {t('emailDetail.threadItemBody.decryptFailed')}
      </div>
    );
  }

  const effectiveHtmlBody = htmlBody || (looksLikeHtml(body || '') ? body : undefined);
  const isHtml = Boolean(effectiveHtmlBody);
  const processedContent = effectiveHtmlBody
    ? sanitizeAndProcessHtml(extractCleanHtmlBody(removeSignature(effectiveHtmlBody, true)))
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
