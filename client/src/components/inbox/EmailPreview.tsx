import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { Email } from 'types/email';
import { MAX_PREVIEW_LENGTH } from 'constants/numbers';

interface EmailPreviewProps {
  email: Email;
}

export const EmailPreview: React.FC<EmailPreviewProps> = ({ email }) => {
  const { t } = useTranslation();

  return (
    <div style={{
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
      marginBottom: theme.spacing.sm,
    }}>
      {(() => {
        if (email.isProcessingSummary) {
          return (
            <>
              <span style={{ 
                display: 'inline-block',
                width: '12px',
                height: '12px',
                border: `2px solid ${theme.colors.text.tertiary}`,
                borderTop: '2px solid transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }} />
              ✨ {t('email.generatingSummary')}
            </>
          );
        }
        if (email.summary) {
          return email.summary;
        }
        if (email.body) {
          return (
            <span
              title={email.body.substring(0, 1000).replace(/[\r\n]+/g, ' ')}
              style={{ cursor: 'help' }}
            >
              {(() => {
                const firstSentenceMatch = email.body.match(/^[^.!?]+[.!?]/);
                if (firstSentenceMatch) {
                  return firstSentenceMatch[0].trim();
                }
                return `${email.body.substring(0, MAX_PREVIEW_LENGTH).replace(/[\r\n]+/g, ' ')}...`;
              })()}
            </span>
          );
        }
        return (
          <span style={{ color: theme.colors.text.tertiary, fontStyle: 'italic' }}>
            {t('inbox.noPreview') || 'Click to view email'}
          </span>
        );
      })()}
    </div>
  );
};





