import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { focusBearKeys } from 'queries/queryKeys';
import { startFocusBearConnect, useDisconnectFocusBear, useFocusBearConnectionQuery } from 'queries/useFocusBear';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { COLOR_NAMED_WHITE } from 'constants/colors';
import {
  FOCUS_BEAR_CONNECT_RESULT_PARAM,
  FOCUS_BEAR_CONNECT_RESULTS,
  FOCUS_BEAR_CONNECTION_METHODS,
  type FocusBearConnectResult,
} from 'constants/focusBear';
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

const messageStyle = (color: string): React.CSSProperties => ({
  fontSize: theme.typography.fontSize.sm,
  color,
});

const RESULT_MESSAGE_KEYS: Record<FocusBearConnectResult, string> = {
  [FOCUS_BEAR_CONNECT_RESULTS.CONNECTED]: 'settings.focusBear.result.connected',
  [FOCUS_BEAR_CONNECT_RESULTS.CANCELLED]: 'settings.focusBear.result.cancelled',
  [FOCUS_BEAR_CONNECT_RESULTS.EXPIRED]: 'settings.focusBear.result.expired',
  [FOCUS_BEAR_CONNECT_RESULTS.FAILED]: 'settings.focusBear.result.failed',
};

const isConnectResult = (value: string | null): value is FocusBearConnectResult =>
  value !== null && Object.prototype.hasOwnProperty.call(RESULT_MESSAGE_KEYS, value);

/** Removes `?focusBear=` so a refresh doesn't show the outcome again; keeps the anchor. */
function stripConnectResultParam(params: URLSearchParams): void {
  params.delete(FOCUS_BEAR_CONNECT_RESULT_PARAM);
  const query = params.toString();
  window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
}

/** The outcome the OAuth callback sent the browser back with, read once on arrival. */
function useConnectResult(): FocusBearConnectResult | null {
  const queryClient = useQueryClient();
  const [result, setResult] = useState<FocusBearConnectResult | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const value = params.get(FOCUS_BEAR_CONNECT_RESULT_PARAM);
    if (!isConnectResult(value)) {
      return;
    }
    setResult(value);
    stripConnectResultParam(params);
    if (value === FOCUS_BEAR_CONNECT_RESULTS.CONNECTED) {
      captureEvent(ANALYTICS_EVENTS.FOCUS_BEAR_CONNECTED);
      void queryClient.invalidateQueries({ queryKey: focusBearKeys.connection });
      queryClient.removeQueries({ queryKey: focusBearKeys.allSuggestions });
    }
  }, [queryClient]);

  return result;
}

/**
 * Connects the user's Focus Bear account by signing in to Focus Bear (OAuth),
 * so "Save to Focus Bear" can suggest a project and a free day. The tokens stay
 * encrypted on the server; none reach the browser.
 */
export const FocusBearConnectionSection: React.FC = () => {
  const { t } = useTranslation();
  const { data: connection } = useFocusBearConnectionQuery();
  const disconnect = useDisconnectFocusBear();
  const connectResult = useConnectResult();
  const [isStarting, setIsStarting] = useState(false);
  const [hasStartFailed, setHasStartFailed] = useState(false);

  const isConnected = connection?.connected === true;
  const isPastedToken = connection?.method === FOCUS_BEAR_CONNECTION_METHODS.PASTED_TOKEN;
  const isOAuthAvailable = connection?.oauthAvailable === true;
  const canConnect = isOAuthAvailable && !isStarting;
  const showConnectButton = !isConnected || isPastedToken;
  const isResultSuccess = connectResult === FOCUS_BEAR_CONNECT_RESULTS.CONNECTED;

  // On success the browser leaves for Focus Bear, so only a failure re-enables the button.
  const connect = async () => {
    setIsStarting(true);
    setHasStartFailed(false);
    try {
      await startFocusBearConnect();
    } catch {
      setHasStartFailed(true);
      setIsStarting(false);
    }
  };

  const statusLabel = (): string => {
    if (!isConnected) {
return t('settings.focusBear.notConnected');
}
    return isPastedToken ? t('settings.focusBear.pastedTokenConnected') : t('settings.focusBear.connected');
  };

  return (
    <div id={SETTINGS_ANCHORS.FOCUS_BEAR} style={cardStyle}>
      <h2 style={titleStyle}>{t('settings.focusBear.title')}</h2>
      <p style={descriptionStyle}>{t('settings.focusBear.description')}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
        {connectResult && (
          <span
            role={isResultSuccess ? 'status' : 'alert'}
            style={messageStyle(isResultSuccess ? theme.colors.accent.success : theme.colors.accent.error)}
          >
            {t(RESULT_MESSAGE_KEYS[connectResult])}
          </span>
        )}
        {isPastedToken && <p style={{ ...descriptionStyle, margin: 0 }}>{t('settings.focusBear.pastedTokenHint')}</p>}
        <div style={{ display: 'flex', gap: theme.spacing.md, alignItems: 'center', flexWrap: 'wrap' }}>
          {showConnectButton && (
            <button
              type="button"
              onClick={connect}
              disabled={!canConnect}
              aria-busy={isStarting}
              style={buttonStyle(theme.colors.primary.main, canConnect)}
            >
              {isStarting ? t('settings.focusBear.connecting') : t('settings.focusBear.connect')}
            </button>
          )}
          {isConnected && (
            <button
              type="button"
              onClick={() =>
                disconnect.mutate(undefined, {
                  onSuccess: () => captureEvent(ANALYTICS_EVENTS.FOCUS_BEAR_DISCONNECTED),
                })
              }
              disabled={disconnect.isPending}
              style={buttonStyle(theme.colors.accent.error, !disconnect.isPending)}
            >
              {t('settings.focusBear.disconnect')}
            </button>
          )}
          {connection && (
            <span role="status" style={messageStyle(isConnected ? theme.colors.accent.success : theme.colors.text.tertiary)}>
              {statusLabel()}
            </span>
          )}
        </div>
        {connection && !isOAuthAvailable && showConnectButton && (
          <span style={messageStyle(theme.colors.text.tertiary)}>{t('settings.focusBear.unavailable')}</span>
        )}
        {hasStartFailed && (
          <span role="alert" style={messageStyle(theme.colors.accent.error)}>
            {t('settings.focusBear.startError')}
          </span>
        )}
      </div>
    </div>
  );
};
