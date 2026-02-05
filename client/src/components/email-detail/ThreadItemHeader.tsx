import React from 'react';
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






