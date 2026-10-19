import React, { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { OpenTrackingSummary } from 'types/email';
import { formatRelativeTime, getOpenTrackingState } from 'utils/openTracking';

import { COLOR_SUCCESS_DARK, COLOR_WARNING_TEXT } from 'constants/colors';
import { OPEN_TRACKING_STATE, OpenTrackingState } from 'constants/openTracking';

import { OpenHistoryTooltip } from './OpenHistoryTooltip';

const TOOLTIP_HIDE_DELAY_MS = 150;
const SINGLE_CHECK = '✓';
const DOUBLE_CHECK = '✓✓';

const STATE_STYLES: Record<OpenTrackingState, { color: string; backgroundColor: string }> = {
  [OPEN_TRACKING_STATE.SENT]: { color: theme.colors.text.tertiary, backgroundColor: theme.colors.background.disabled },
  [OPEN_TRACKING_STATE.OPENED]: { color: COLOR_SUCCESS_DARK, backgroundColor: theme.colors.success.light },
  [OPEN_TRACKING_STATE.MAYBE_AUTOMATIC]: { color: COLOR_WARNING_TEXT, backgroundColor: theme.colors.warning.light },
};

interface OpenTrackingIndicatorProps {
  summary: OpenTrackingSummary;
}

function useIndicatorLabel(summary: OpenTrackingSummary, state: OpenTrackingState): string {
  const { t, i18n } = useTranslation();
  if (state === OPEN_TRACKING_STATE.OPENED && summary.lastOpenedAt) {
    return t('openTracking.opened', {
      count: summary.openCount,
      time: formatRelativeTime(summary.lastOpenedAt, i18n.language),
    });
  }
  if (state === OPEN_TRACKING_STATE.MAYBE_AUTOMATIC) {
    return t('openTracking.maybeAutomatic');
  }
  return t('openTracking.sent');
}

/**
 * Mailtrack-style double-check for a message the user sent: "✓ Sent" until a
 * recipient opens it, then "✓✓ Opened 3× · 2 hr. ago". Opens that only came
 * from Apple Mail Privacy Protection are shown as "may be automatic". Hover or
 * focus reveals the open history.
 */
export const OpenTrackingIndicator: React.FC<OpenTrackingIndicatorProps> = ({ summary }) => {
  const tooltipId = useId();
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const state = getOpenTrackingState(summary);
  const label = useIndicatorLabel(summary, state);

  const showTooltip = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
    }
    setIsTooltipVisible(true);
  };
  const hideTooltip = () => {
    hideTimer.current = setTimeout(() => setIsTooltipVisible(false), TOOLTIP_HIDE_DELAY_MS);
  };

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
    >
      <button
        type="button"
        data-testid="open-tracking-indicator"
        data-state={state}
        aria-describedby={isTooltipVisible ? tooltipId : undefined}
        onFocus={showTooltip}
        onBlur={hideTooltip}
        onClick={event => {
          // Lives inside clickable headers; showing the history must not toggle them.
          event.stopPropagation();
          setIsTooltipVisible(visible => !visible);
        }}
        style={{
          ...STATE_STYLES[state],
          display: 'inline-flex',
          alignItems: 'center',
          gap: theme.spacing.xs,
          padding: `2px ${theme.spacing.sm}`,
          border: 'none',
          borderRadius: theme.borderRadius.full,
          fontSize: theme.typography.fontSize.xs,
          fontWeight: theme.typography.fontWeight.semibold,
          lineHeight: 1.6,
          whiteSpace: 'nowrap',
          cursor: 'help',
        }}
      >
        <span aria-hidden="true" style={{ letterSpacing: '-0.25em', marginRight: '0.25em' }}>
          {state === OPEN_TRACKING_STATE.SENT ? SINGLE_CHECK : DOUBLE_CHECK}
        </span>
        {label}
      </button>
      {isTooltipVisible && <OpenHistoryTooltip id={tooltipId} summary={summary} />}
    </span>
  );
};
