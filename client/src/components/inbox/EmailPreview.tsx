import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { Email } from 'types/email';
import { stripHtmlTags } from 'utils/emailBodyUtils';

import { MAX_PREVIEW_LENGTH, TOOLTIP_PREVIEW_MAX_CHARS } from 'constants/numbers';
import { CATEGORY_OTHER } from 'constants/strings';

interface EmailPreviewProps {
  email: Email;
}

export const EmailPreview: React.FC<EmailPreviewProps> = ({ email }) => {
  const { t } = useTranslation();
  const isOtherCategory = email.category === CATEGORY_OTHER;
  const hasCategoryExplanation = isOtherCategory && email.categoryExplanation;

  return (
    <div style={{ marginBottom: theme.spacing.sm }}>
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
          position: 'relative',
        }}
      >
        {(() => {
          if (email.isProcessingSummary) {
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
                ✨ {t('email.generatingSummary')}
              </>
            );
          }
          if (email.summary) {
            return email.summary;
          }
          if (email.body) {
            const plainText = stripHtmlTags(email.body)
              .replace(/[\r\n]+/g, ' ')
              .trim();
            if (plainText) {
              return (
                <span title={plainText.substring(0, TOOLTIP_PREVIEW_MAX_CHARS)} style={{ cursor: 'help' }}>
                  {(() => {
                    const firstSentenceMatch = plainText.match(/^[^.!?]+[.!?]/);
                    if (firstSentenceMatch) {
                      return firstSentenceMatch[0].trim();
                    }
                    return `${plainText.substring(0, MAX_PREVIEW_LENGTH)}...`;
                  })()}
                </span>
              );
            }
          }
          return (
            <span style={{ color: theme.colors.text.tertiary, fontStyle: 'italic' }}>
              {t('inbox.noPreview') || 'Click to view email'}
            </span>
          );
        })()}
      </div>
      {hasCategoryExplanation && (
        <div
          style={{
            color: theme.colors.text.tertiary,
            fontSize: theme.typography.fontSize.xs,
            marginTop: theme.spacing.xs,
            fontStyle: 'italic',
            display: 'flex',
            alignItems: 'center',
            gap: theme.spacing.xs,
          }}
        >
          <span>💡</span>
          <span>{email.categoryExplanation}</span>
        </div>
      )}
    </div>
  );
};
