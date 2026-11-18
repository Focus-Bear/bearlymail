import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

/** Nudges the checkbox down to line up with the option title. */
const CHECKBOX_TOP_OFFSET_PX = 3;

interface ConsentSettingsWriteChoiceProps {
  allowSettingsWrite: boolean;
  onChange: (allowSettingsWrite: boolean) => void;
}

/**
 * Opt-in to letting the app edit email categories and category rules. Off by
 * default: rules decide where all future mail is filed, so an assistant that
 * only reads mail never needs it.
 */
export const ConsentSettingsWriteChoice: React.FC<ConsentSettingsWriteChoiceProps> = ({
  allowSettingsWrite,
  onChange,
}) => {
  const { t } = useTranslation();
  return (
    <label
      style={{
        display: 'flex',
        gap: theme.spacing.sm,
        margin: `-${theme.spacing.sm} 0 ${theme.spacing.lg}`,
        padding: theme.spacing.sm,
        border: `1px solid ${allowSettingsWrite ? theme.colors.primary.main : theme.colors.border.light}`,
        borderRadius: theme.borderRadius.md,
        backgroundColor: allowSettingsWrite ? theme.colors.primary.subtle : theme.colors.background.paper,
        cursor: 'pointer',
      }}
    >
      <input
        type="checkbox"
        checked={allowSettingsWrite}
        onChange={(event) => onChange(event.target.checked)}
        data-testid="oauth-consent-settings-write"
        style={{ marginTop: CHECKBOX_TOP_OFFSET_PX }}
      />
      <span>
        <span style={{ display: 'block', fontSize: theme.typography.fontSize.sm, fontWeight: theme.typography.fontWeight.semibold }}>
          {t('oauthConsent.settingsWriteTitle')}
        </span>
        <span style={{ display: 'block', fontSize: theme.typography.fontSize.xs, color: theme.colors.text.secondary }}>
          {t('oauthConsent.settingsWriteDescription')}
        </span>
      </span>
    </label>
  );
};
