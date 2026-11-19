import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { focusBearKeys } from 'queries/queryKeys';
import { useDisconnectFocusBear, useFocusBearConnectionQuery, useStartFocusBearConnect } from 'queries/useFocusBear';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { COLOR_NAMED_WHITE } from 'constants/colors';
import { FOCUS_BEAR_CONNECT_RESULT } from 'constants/focusBear';
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

/**
 * Connects the user's Focus Bear account by sending them to Focus Bear to sign in,
 * so "Save to Focus Bear" can suggest a project and a free day. No Focus Bear
 * credential is entered here, and none reaches the browser.
 */
export const FocusBearConnectionSection: React.FC = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [hasConnectFailed, setHasConnectFailed] = useState(false);
  const { data: connection } = useFocusBearConnectionQuery();
  const startConnect = useStartFocusBearConnect();
  const disconnect = useDisconnectFocusBear();
  const isConnected = connection?.connected === true;
  const connectResult = searchParams.get(FOCUS_BEAR_CONNECT_RESULT.QUERY_PARAM);

  // The server redirects back here after the Focus Bear sign-in with the outcome in the URL.
  useEffect(() => {
    if (!connectResult) {
      return;
    }
    if (connectResult === FOCUS_BEAR_CONNECT_RESULT.CONNECTED) {
      captureEvent(ANALYTICS_EVENTS.FOCUS_BEAR_CONNECTED);
      void queryClient.invalidateQueries({ queryKey: focusBearKeys.connection });
      queryClient.removeQueries({ queryKey: focusBearKeys.allSuggestions });
    }
    setHasConnectFailed(connectResult === FOCUS_BEAR_CONNECT_RESULT.FAILED);
    // Dropped from the URL so a reload doesn't report the same outcome again.
    setSearchParams(
      params => {
        params.delete(FOCUS_BEAR_CONNECT_RESULT.QUERY_PARAM);
        return params;
      },
      { replace: true }
    );
  }, [connectResult, queryClient, setSearchParams]);

  return (
    <div id={SETTINGS_ANCHORS.FOCUS_BEAR} style={cardStyle}>
      <h2 style={titleStyle}>{t('settings.focusBear.title')}</h2>
      <p style={descriptionStyle}>{t('settings.focusBear.description')}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
        <div style={{ display: 'flex', gap: theme.spacing.md, alignItems: 'center', flexWrap: 'wrap' }}>
          {isConnected ? (
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
          ) : (
            <button
              type="button"
              onClick={() => {
                setHasConnectFailed(false);
                startConnect.mutate();
              }}
              disabled={startConnect.isPending}
              style={buttonStyle(theme.colors.primary.main, !startConnect.isPending)}
            >
              {startConnect.isPending ? t('settings.focusBear.connecting') : t('settings.focusBear.connect')}
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
        {(hasConnectFailed || startConnect.isError) && (
          <span role="alert" style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.accent.error }}>
            {t(startConnect.isError ? 'settings.focusBear.connectUnavailable' : 'settings.focusBear.connectFailed')}
          </span>
        )}
      </div>
    </div>
  );
};
