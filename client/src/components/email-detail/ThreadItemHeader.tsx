import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { humanizeTimestamp } from 'utils/dateUtils';

interface ThreadItemHeaderProps {
  from: string;
  fromName?: string;
  to?: string;
  cc?: string;
  receivedAt: string;
  isExpanded: boolean;
  isCurrentEmail: boolean;
  onToggle: () => void;
}

export const ThreadItemHeader: React.FC<ThreadItemHeaderProps> = ({
  from,
  fromName,
  to,
  cc,
  receivedAt,
  isExpanded,
  isCurrentEmail,
  onToggle,
}) => {
  const { t } = useTranslation();
  const [emailCopied, setEmailCopied] = useState(false);
  const handleCopyEmail = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(from);
      setEmailCopied(true);
      setTimeout(() => setEmailCopied(false), 2000);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to copy email:', err);
    }
  }, [from]);

  const getBackgroundColor = (): string => {
    if (isCurrentEmail) return theme.colors.primary.subtle;
    return theme.colors.background.subtle;
  };

  return (
    <div
      onClick={onToggle}
      style={{
        padding: theme.spacing.md,
        backgroundColor: getBackgroundColor(),
        cursor: 'pointer',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.xs }}>
          <strong style={{ color: theme.colors.text.primary }}>
            {fromName || from}
          </strong>
          {from && fromName && (
            <span
              onClick={(e) => { e.stopPropagation(); handleCopyEmail(); }}
              title={emailCopied ? t('emailDetail.emailCopied') : t('emailDetail.clickToCopyEmail')}
              style={{
                fontSize: theme.typography.fontSize.xs,
                color: emailCopied ? theme.colors.accent.success : theme.colors.text.secondary,
                cursor: 'pointer',
              }}
            >
              {/* eslint-disable-next-line i18next/no-literal-string */}
              &lt;{from}&gt;
            </span>
          )}
          <span style={{ color: theme.colors.text.secondary }}>
            {humanizeTimestamp(new Date(receivedAt))}
          </span>
        </div>
                {to && (
                  <div style={{ 
                    fontSize: theme.typography.fontSize.xs, 
                    color: theme.colors.text.secondary,
                    marginTop: theme.spacing.xs 
                  }}>
                    {/* eslint-disable-next-line i18next/no-literal-string */}
                    <span style={{ fontWeight: theme.typography.fontWeight.medium }}>To:</span> {to}
                  </div>
                )}
                {cc && (
                  <div style={{ 
                    fontSize: theme.typography.fontSize.xs, 
                    color: theme.colors.text.secondary,
                    marginTop: theme.spacing.xs 
                  }}>
                    {/* eslint-disable-next-line i18next/no-literal-string */}
                    <span style={{ fontWeight: theme.typography.fontWeight.medium }}>CC:</span> {cc}
                  </div>
                )}
      </div>
      <span style={{ color: theme.colors.text.tertiary }}>
        {isExpanded ? '▼' : '▶'}
      </span>
    </div>
  );
};






