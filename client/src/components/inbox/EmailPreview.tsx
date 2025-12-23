import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from '../../theme/theme';
import { Email } from '../../types/email';

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
      {email.isProcessingSummary ? (
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
      ) : email.summary ? (
        email.summary
      ) : email.body ? (
        <span
          title={email.body.substring(0, 1000).replace(/[\r\n]+/g, ' ')}
          style={{ cursor: 'help' }}
        >
          {(() => {
            const firstSentenceMatch = email.body.match(/^[^.!?]+[.!?]/);
            if (firstSentenceMatch) {
              return firstSentenceMatch[0].trim();
            }
            return `${email.body.substring(0, 150).replace(/[\r\n]+/g, ' ')}...`;
          })()}
        </span>
      ) : (
        <span style={{ color: theme.colors.text.tertiary, fontStyle: 'italic' }}>
          {t('inbox.noPreview') || 'Click to view email'}
        </span>
      )}
    </div>
  );
};



