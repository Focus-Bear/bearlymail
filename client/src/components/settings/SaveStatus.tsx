import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_TRANSPARENT } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';
import { AUTOSAVE_STATUS, AutosaveStatus } from 'hooks/useAutosave';

interface SaveStatusProps {
  status: AutosaveStatus;
  onRetry: () => void;
}

/**
 * The small "Saving…" / "Saved ✓" / "Couldn't save" note beside a setting that
 * saves itself. Announced politely to screen readers; takes no space when idle.
 */
export const SaveStatus: React.FC<SaveStatusProps> = ({ status, onRetry }) => {
  const { t } = useTranslation();

  return (
    <span
      role="status"
      aria-live="polite"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: theme.spacing.xs,
        fontSize: theme.typography.fontSize.sm,
        color: status === AUTOSAVE_STATUS.ERROR ? theme.colors.error.dark : theme.colors.text.secondary,
        whiteSpace: 'nowrap',
      }}
    >
      {status === AUTOSAVE_STATUS.SAVING && t('settings.autosave.saving')}
      {status === AUTOSAVE_STATUS.SAVED && t('settings.autosave.saved')}
      {status === AUTOSAVE_STATUS.ERROR && (
        <>
          {t('settings.autosave.error')}
          <button
            type="button"
            onClick={onRetry}
            style={{
              border: STRING_NONE,
              background: COLOR_TRANSPARENT,
              padding: 0,
              color: theme.colors.text.primary,
              textDecoration: 'underline',
              cursor: 'pointer',
              fontSize: 'inherit',
            }}
          >
            {t('settings.autosave.retry')}
          </button>
        </>
      )}
    </span>
  );
};
