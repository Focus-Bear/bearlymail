import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from '../../../theme/theme';
import { EmailCardSnoozeInput } from './EmailCardSnoozeInput';

interface EmailCardActionsProps {
  isStarred?: boolean;
  showSnoozeInput: boolean;
  snoozeInput: string;
  onToggleStar: (e: React.MouseEvent) => void;
  onArchive: (e: React.MouseEvent) => void;
  onShowSnoozeInput: () => void;
  onSnoozeInputChange: (value: string) => void;
  onSnooze: () => void;
  onHideSnoozeInput: () => void;
}

/**
 * Email card actions component
 * Handles star, archive, and snooze actions
 */
export const EmailCardActions: React.FC<EmailCardActionsProps> = ({
  isStarred,
  showSnoozeInput,
  snoozeInput,
  onToggleStar,
  onArchive,
  onShowSnoozeInput,
  onSnoozeInputChange,
  onSnooze,
  onHideSnoozeInput,
}) => {
  const { t } = useTranslation();

  return (
    <div style={{ display: 'flex', gap: theme.spacing.sm }} onClick={(e) => e.stopPropagation()}>
      <button
        onClick={onToggleStar}
        title={t('emailActions.toggleStar')}
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontSize: '1.2rem',
          padding: '0 4px',
          color: isStarred ? theme.colors.accent.warning : theme.colors.text.tertiary,
        }}
      >
        {isStarred ? '⭐' : '☆'}
      </button>
      <button
        onClick={onArchive}
        title={t('emailActions.archive')}
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontSize: '1.2rem',
          padding: '0 4px',
          color: theme.colors.text.tertiary,
        }}
      >
        📥
      </button>

      {showSnoozeInput ? (
        <EmailCardSnoozeInput
          snoozeInput={snoozeInput}
          onSnoozeInputChange={onSnoozeInputChange}
          onSnooze={onSnooze}
          onHideSnoozeInput={onHideSnoozeInput}
        />
      ) : (
        <button
          onClick={onShowSnoozeInput}
          style={{
            color: theme.colors.text.tertiary,
            backgroundColor: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontSize: theme.typography.fontSize.xs,
            fontWeight: theme.typography.fontWeight.medium,
            padding: theme.spacing.xs,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = theme.colors.primary.main)}
          onMouseLeave={(e) => (e.currentTarget.style.color = theme.colors.text.tertiary)}
        >
          {t('emailActions.snooze')}
        </button>
      )}
    </div>
  );
};

