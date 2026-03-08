import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { MAX_PREVIEW_LENGTH } from 'components/inbox/constants';
import { TOOLTIP_PREVIEW_MAX_CHARS } from 'constants/numbers';

interface EmailCardBodyProps {
  subject: string;
  isRead: boolean;
  body: string;
  summary?: string | null;
  isProcessingSummary: boolean;
}

/**
 * Email card body component
 * Displays subject and body preview/summary
 */
export const EmailCardBody: React.FC<EmailCardBodyProps> = ({
  subject,
  isRead,
  body,
  summary,
  isProcessingSummary,
}) => {
  const { t } = useTranslation();

  const extractPreview = (bodyText: string): string => {
    const firstSentenceMatch = bodyText.match(/^[^.!?]+[.!?]/);
    if (firstSentenceMatch) {
      return firstSentenceMatch[0].trim();
    }
    return `${bodyText.substring(0, MAX_PREVIEW_LENGTH).replace(/[\r\n]+/g, ' ')}...`;
  };

  return (
    <>
      <div
        style={{
          color: isRead ? theme.colors.text.secondary : theme.colors.text.primary,
          fontSize: theme.typography.fontSize.lg,
          fontWeight: isRead ? theme.typography.fontWeight.normal : theme.typography.fontWeight.bold,
          marginBottom: theme.spacing.sm,
        }}
      >
        {subject}
      </div>

      <div
        style={{
          color: theme.colors.text.secondary,
          fontSize: theme.typography.fontSize.sm,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          maxWidth: '600px',
          lineHeight: theme.typography.lineHeight.relaxed,
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.xs,
        }}
      >
        {(() => {
          if (isProcessingSummary) {
            return (
              <>
                <span
                  style={{
                    display: 'inline-block',
                    width: '12px',
                    height: '12px',
                    border: `2px solid ${theme.colors.text.tertiary}`,
                    borderTop: '2px solid transparent',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                  }}
                />
                {t('email.generatingSummary')}
              </>
            );
          }
          if (summary) {
            return summary;
          }
          return (
            <span
              title={body.substring(0, TOOLTIP_PREVIEW_MAX_CHARS).replace(/[\r\n]+/g, ' ')}
              style={{ cursor: 'help' }}
            >
              {extractPreview(body)}
            </span>
          );
        })()}
      </div>
    </>
  );
};
