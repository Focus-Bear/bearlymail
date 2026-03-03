import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { GITHUB_STATE_OPEN, GITHUB_STATE_CLOSED } from 'constants/strings';

interface StatusSelectorProps {
  state: typeof GITHUB_STATE_OPEN | typeof GITHUB_STATE_CLOSED;
  onStateChange: (state: typeof GITHUB_STATE_OPEN | typeof GITHUB_STATE_CLOSED) => void;
}

export const StatusSelector: React.FC<StatusSelectorProps> = ({ state, onStateChange }) => {
  const { t } = useTranslation();
  
  return (
    <div style={{ marginBottom: theme.spacing.lg }}>
      <label style={{
        display: 'block',
        marginBottom: theme.spacing.md,
        color: theme.colors.text.primary,
        fontWeight: theme.typography.fontWeight.medium,
      }}>
        {t('quickActions.github.status')}
      </label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
        <label style={{
          display: 'flex',
          alignItems: 'center',
          cursor: 'pointer',
          padding: theme.spacing.sm,
          borderRadius: theme.borderRadius.md,
          backgroundColor: state === GITHUB_STATE_OPEN ? theme.colors.primary.subtle : 'transparent',
        }}>
          <input
            type="radio"
            value={GITHUB_STATE_OPEN}
            checked={state === GITHUB_STATE_OPEN}
            onChange={(e) => onStateChange(e.target.value as typeof GITHUB_STATE_OPEN)}
            style={{ marginRight: theme.spacing.sm }}
          />
          <span>{t('quickActions.github.open')}</span>
        </label>
        <label style={{
          display: 'flex',
          alignItems: 'center',
          cursor: 'pointer',
          padding: theme.spacing.sm,
          borderRadius: theme.borderRadius.md,
          backgroundColor: state === GITHUB_STATE_CLOSED ? theme.colors.primary.subtle : 'transparent',
        }}>
          <input
            type="radio"
            value={GITHUB_STATE_CLOSED}
            checked={state === GITHUB_STATE_CLOSED}
            onChange={(e) => onStateChange(e.target.value as typeof GITHUB_STATE_CLOSED)}
            style={{ marginRight: theme.spacing.sm }}
          />
          <span>{t('quickActions.github.closed')}</span>
        </label>
      </div>
    </div>
  );
};



