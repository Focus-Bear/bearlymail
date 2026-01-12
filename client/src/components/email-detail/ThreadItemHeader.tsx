import React from 'react';
import { theme } from 'theme/theme';
import { humanizeTimestamp } from 'utils/dateUtils';

interface ThreadItemHeaderProps {
  from: string;
  fromName?: string;
  receivedAt: string;
  isExpanded: boolean;
  isCurrentEmail: boolean;
  onToggle: () => void;
}

export const ThreadItemHeader: React.FC<ThreadItemHeaderProps> = ({
  from,
  fromName,
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
        alignItems: 'center',
      }}
    >
      <div>
        <strong style={{ color: theme.colors.text.primary }}>
          {fromName || from}
        </strong>
        <span style={{ color: theme.colors.text.secondary, marginLeft: theme.spacing.xs }}>
          {humanizeTimestamp(new Date(receivedAt))}
        </span>
      </div>
      <span style={{ color: theme.colors.text.tertiary }}>
        {isExpanded ? '▼' : '▶'}
      </span>
    </div>
  );
};






