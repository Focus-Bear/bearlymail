import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useConnectFocusBear, useDisconnectFocusBear, useFocusBearConnectionQuery } from 'queries/useFocusBear';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { COLOR_NAMED_WHITE } from 'constants/colors';
import { INPUT_WIDTH_PX } from 'constants/numbers';
import { SETTINGS_ANCHORS } from 'constants/settingsAnchors';
import { STRING_NONE } from 'constants/strings';

const buttonStyle = (backgroundColor: string, isEnabled = true): React.CSSProperties => ({
  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
  backgroundColor: isEnabled ? backgroundColor : theme.colors.text.tertiary,
  color: COLOR_NAMED_WHITE,
  border: STRING_NONE,
  borderRadius: theme.borderRadius.md,
  cursor: isEnabled ? 'pointer' : 'not-allowed',
});

const cardStyle: React.CSSProperties = {
  backgroundColor: theme.colors.background.paper,
  borderRadius: theme.borderRadius.lg,
  padding: theme.spacing.xl,
  marginBottom: theme.spacing.lg,
  boxShadow: theme.shadows.md,
};

const titleStyle: React.CSSProperties = {
  color: theme.colors.text.primary,
  marginBottom: theme.spacing.md,
  fontSize: theme.typography.fontSize.xl,
  scrollMarginTop: `${INPUT_WIDTH_PX}px`,
};

const descriptionStyle: React.CSSProperties = {
  color: theme.colors.text.secondary,
  marginBottom: theme.spacing.md,
  fontSize: theme.typography.fontSize.sm,
};

const tokenInputStyle: React.CSSProperties = {
  padding: theme.spacing.sm,
  border: `1px solid ${theme.colors.border.medium}`,
  borderRadius: theme.borderRadius.md,
  fontSize: theme.typography.fontSize.sm,
  fontFamily: 'monospace',
};

/**
 * Connects the user's Focus Bear account with an access token they create in
 * Focus Bear, so "Save to Focus Bear" can suggest a project and a free day.
 * The token is stored encrypted and never sent back to the browser.
 */
export const FocusBearConnectionSection: React.FC = () => {
  const { t } = useTranslation();
  const [token, setToken] = useState('');
  const { data: connection } = useFocusBearConnectionQuery();
  const connect = useConnectFocusBear();
  const disconnect = useDisconnectFocusBear();
  const isConnected = connection?.connected === true;
  const hasToken = token.trim().length > 0;

  const save = () =>
    connect.mutate(token.trim(), {
      onSuccess: () => {
        setToken('');
        captureEvent(ANALYTICS_EVENTS.FOCUS_BEAR_CONNECTED);
      },
    });

  return (
    <div id={SETTINGS_ANCHORS.FOCUS_BEAR} style={cardStyle}>
      <h2 style={titleStyle}>{t('settings.focusBear.title')}</h2>
      <p style={descriptionStyle}>{t('settings.focusBear.description')}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
        <input
          type="password"
          value={token}
          onChange={event => setToken(event.target.value)}
          aria-label={t('settings.focusBear.tokenLabel')}
          placeholder={t('settings.focusBear.tokenPlaceholder')}
          autoComplete="off"
          style={tokenInputStyle}
        />
        <div style={{ display: 'flex', gap: theme.spacing.md, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={save}
            disabled={!hasToken || connect.isPending}
            style={buttonStyle(theme.colors.primary.main, hasToken && !connect.isPending)}
          >
            {connect.isPending ? t('settings.focusBear.checking') : t('settings.focusBear.connect')}
          </button>
          {isConnected && (
            <button
              type="button"
              onClick={() =>
                disconnect.mutate(undefined, {
                  onSuccess: () => captureEvent(ANALYTICS_EVENTS.FOCUS_BEAR_DISCONNECTED),
                })
              }
              style={buttonStyle(theme.colors.accent.error)}
            >
              {t('settings.focusBear.disconnect')}
            </button>
          )}
          <span
            role="status"
            style={{
              fontSize: theme.typography.fontSize.sm,
              color: isConnected ? theme.colors.accent.success : theme.colors.text.tertiary,
            }}
          >
            {isConnected ? t('settings.focusBear.connected') : t('settings.focusBear.notConnected')}
          </span>
        </div>
        {connect.isError && (
          <span role="alert" style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.accent.error }}>
            {t('settings.focusBear.tokenRejected')}
          </span>
        )}
      </div>
    </div>
  );
};
