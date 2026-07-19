import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { theme } from 'theme/theme';

import { COLOR_NAMED_WHITE } from 'constants/colors';
import { EMOJI_WRENCH } from 'constants/emojis';
import { KEY_ENTER, KEY_SPACE } from 'constants/strings';
import { useDebugMode } from 'hooks/useDebugMode';

const REPLAY_TOUR_PATH = '/inbox?replayTour=true';

const SettingRow: React.FC<{ label: string; description: string; control: React.ReactNode; marginTop?: string }> = ({
  label,
  description,
  control,
  marginTop,
}) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: theme.spacing.md,
      marginTop,
      backgroundColor: theme.colors.background.subtle,
      borderRadius: theme.borderRadius.md,
      border: `1px solid ${theme.colors.border.light}`,
      gap: theme.spacing.md,
    }}
  >
    <div style={{ flex: 1 }}>
      <div
        style={{
          fontWeight: 600,
          fontSize: theme.typography.fontSize.sm,
          color: theme.colors.text.primary,
          marginBottom: theme.spacing.xs,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.text.secondary }}>{description}</div>
    </div>
    {control}
  </div>
);

const DebugModeToggle: React.FC = () => {
  const { t } = useTranslation();
  const { isDebugModeEnabled, setDebugModeEnabled } = useDebugMode();
  return (
    <label
      onClick={() => setDebugModeEnabled(!isDebugModeEnabled)}
      style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm, cursor: 'pointer', flexShrink: 0 }}
    >
      <span style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.text.secondary }}>
        {isDebugModeEnabled ? t('settings.debugMode.enabled') : t('settings.debugMode.disabled')}
      </span>
      <div
        role="switch"
        aria-checked={isDebugModeEnabled}
        aria-label={t('settings.debugMode.label')}
        tabIndex={0}
        onKeyDown={event => {
          if (event.key === KEY_ENTER || event.key === KEY_SPACE) {
            event.preventDefault();
            setDebugModeEnabled(!isDebugModeEnabled);
          }
        }}
        style={{
          width: '44px',
          height: '24px',
          borderRadius: '12px',
          backgroundColor: isDebugModeEnabled ? theme.colors.primary.main : theme.colors.border.light,
          position: 'relative',
          cursor: 'pointer',
          transition: 'background-color 0.2s ease',
          outline: 'none',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '2px',
            left: isDebugModeEnabled ? '22px' : '2px',
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            backgroundColor: COLOR_NAMED_WHITE,
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            transition: 'left 0.2s ease',
          }}
        />
      </div>
    </label>
  );
};

export const TroubleshootingSection: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <section
      id="troubleshooting"
      style={{
        marginTop: theme.spacing['2xl'],
        paddingTop: theme.spacing.xl,
        borderTop: `1px solid ${theme.colors.border.light}`,
      }}
    >
      <h2
        style={{
          fontSize: theme.typography.fontSize.lg,
          fontWeight: 600,
          color: theme.colors.text.primary,
          marginBottom: theme.spacing.sm,
        }}
      >
        {EMOJI_WRENCH} {t('settings.troubleshooting.title')}
      </h2>

      <SettingRow
        label={t('settings.debugMode.label')}
        description={t('settings.debugMode.description')}
        control={<DebugModeToggle />}
      />

      <SettingRow
        label={t('settings.replayTour.label')}
        description={t('settings.replayTour.description')}
        marginTop={theme.spacing.md}
        control={
          <button
            type="button"
            onClick={() => navigate(REPLAY_TOUR_PATH)}
            style={{
              flexShrink: 0,
              padding: `${theme.spacing.sm} ${theme.spacing.md}`,
              backgroundColor: theme.colors.primary.subtle,
              color: theme.colors.primary.main,
              border: `1px solid ${theme.colors.primary.main}`,
              borderRadius: theme.borderRadius.md,
              fontSize: theme.typography.fontSize.sm,
              fontWeight: theme.typography.fontWeight.semibold,
              cursor: 'pointer',
            }}
          >
            {t('settings.replayTour.button')}
          </button>
        }
      />
    </section>
  );
};
