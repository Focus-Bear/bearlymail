import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_NAMED_WHITE } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

interface ScheduledCoachmarkProps {
  onDismiss: () => void;
}

/**
 * One-time popover anchored under the inbox ⋮ menu, shown after a user's first
 * scheduled send to point them at where Scheduled emails live (since the
 * Scheduled link is not in the sidebar). The parent must be position:relative.
 */
export const ScheduledCoachmark: React.FC<ScheduledCoachmarkProps> = ({ onDismiss }) => {
  const { t } = useTranslation();

  return (
    <div
      role="dialog"
      aria-label={t('inbox.scheduledTour.title')}
      style={{
        position: 'absolute',
        right: 0,
        top: 'calc(100% + 10px)',
        zIndex: 40,
        width: '260px',
        backgroundColor: theme.colors.primary.main,
        color: COLOR_NAMED_WHITE,
        borderRadius: theme.borderRadius.md,
        boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
        padding: theme.spacing.md,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: '-6px',
          right: '14px',
          width: '12px',
          height: '12px',
          backgroundColor: theme.colors.primary.main,
          transform: 'rotate(45deg)',
        }}
      />
      <div style={{ fontWeight: theme.typography.fontWeight.semibold, marginBottom: theme.spacing.xs }}>
        {t('inbox.scheduledTour.title')}
      </div>
      <div style={{ fontSize: theme.typography.fontSize.sm, opacity: 0.95, lineHeight: 1.4 }}>
        {t('inbox.scheduledTour.body')}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: theme.spacing.sm }}>
        <button
          onClick={onDismiss}
          style={{
            background: COLOR_NAMED_WHITE,
            color: theme.colors.primary.main,
            border: STRING_NONE,
            borderRadius: theme.borderRadius.sm,
            padding: `${theme.spacing.xs} ${theme.spacing.md}`,
            fontSize: theme.typography.fontSize.sm,
            fontWeight: theme.typography.fontWeight.semibold,
            cursor: 'pointer',
          }}
        >
          {t('inbox.scheduledTour.dismiss')}
        </button>
      </div>
    </div>
  );
};
