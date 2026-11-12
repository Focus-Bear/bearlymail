import React, { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { InboxMode } from 'types/email';
import { captureEvent } from 'utils/posthog';

import { ACTION_TAB_EMPHASIS_CLASS, ActionTabEmphasis } from 'constants/actionMove';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { OPACITY_DISABLED, OPACITY_FULL } from 'constants/numbers';
import { MODE_ACTION, MODE_FOLLOW_UP, MODE_TRIAGE, STRING_NONE } from 'constants/strings';
import { TOUR_TARGETS } from 'constants/tour';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';

interface TabCounts {
  triage: number;
  action: number;
  followUp: number;
}

interface InboxHeaderTabsProps {
  mode: InboxMode;
  setMode: (mode: InboxMode) => void;
  loadingModeSwitch: boolean;
  triageTabRef: RefObject<HTMLButtonElement | null>;
  actionTabRef: RefObject<HTMLButtonElement | null>;
  followUpTabRef: RefObject<HTMLButtonElement | null>;
  tabCounts?: TabCounts | null;
  /** Animation to play on the Action tab because an email just moved there. */
  actionTabEmphasis?: ActionTabEmphasis | null;
  onActionTabEmphasisEnd?: () => void;
  /** Emails moved to Action since the user last opened it, shown as a "+N" badge. */
  actionMovedCount?: number;
  /** The tabs have a header row to themselves (narrow screens), so they split it evenly. */
  isFullWidthRow?: boolean;
}

/** The "+N" badge's pop animation bubbles up to the tab too; only the tab's own animation ends the emphasis. */
function endEmphasisOnOwnAnimation(
  event: React.AnimationEvent<HTMLButtonElement>,
  emphasis: ActionTabEmphasis | null | undefined,
  onEmphasisEnd: (() => void) | undefined
) {
  if (emphasis && event.target === event.currentTarget) {
    onEmphasisEnd?.();
  }
}

const MovedToActionBadge: React.FC<{ count: number }> = ({ count }) => {
  const { t } = useTranslation();
  if (count <= 0) {
    return null;
  }
  return (
    <span className="action-tab-badge" aria-hidden="true" data-testid="action-tab-moved-badge">
      {t('inbox.actionMove.badge', { count })}
    </span>
  );
};

function getTabButtonStyle({
  isActive,
  isMobile,
  isLoading,
}: {
  isActive: boolean;
  isMobile: boolean;
  isLoading: boolean;
}): React.CSSProperties {
  return {
    padding: isMobile ? `${theme.spacing.xs} ${theme.spacing.sm}` : `${theme.spacing.sm} ${theme.spacing.lg}`,
    backgroundColor: isActive ? theme.colors.primary.subtle : 'transparent',
    color: isActive ? theme.colors.primary.main : theme.colors.text.secondary,
    border: STRING_NONE,
    borderRadius: theme.borderRadius.full,
    cursor: isLoading ? 'wait' : 'pointer',
    fontWeight: theme.typography.fontWeight.semibold,
    fontSize: isMobile ? theme.typography.fontSize.md : theme.typography.fontSize.base,
    whiteSpace: 'nowrap',
    opacity: isLoading ? OPACITY_DISABLED : OPACITY_FULL,
  };
}

/** On narrow screens the tabs have their own header row, split evenly; otherwise they sit inline. */
function getTabsRowStyle(isFullWidthRow: boolean): React.CSSProperties {
  if (isFullWidthRow) {
    return { display: 'grid', gridAutoFlow: 'column', gridAutoColumns: 'minmax(0, 1fr)', gap: theme.spacing.xs };
  }
  return { display: 'flex', gap: theme.spacing.md };
}

/**
 * Inbox header tabs component
 * Displays tab navigation for inbox modes
 */
export const InboxHeaderTabs: React.FC<InboxHeaderTabsProps> = ({
  mode,
  setMode,
  loadingModeSwitch,
  triageTabRef,
  actionTabRef,
  followUpTabRef,
  tabCounts,
  actionTabEmphasis,
  onActionTabEmphasisEnd,
  actionMovedCount = 0,
  isFullWidthRow = false,
}) => {
  const { t } = useTranslation();
  const { isMobile } = useResponsiveBreakpoints();

  const handleTabClick = (newMode: InboxMode) => {
    if (mode !== newMode) {
      captureEvent(ANALYTICS_EVENTS.INBOX_MODE_CHANGED, {
        from_mode: mode,
        to_mode: newMode,
      });
      setMode(newMode);
    }
  };

  const getTabStyle = (tabMode: InboxMode) =>
    getTabButtonStyle({ isActive: mode === tabMode, isMobile, isLoading: loadingModeSwitch });

  const getTabLabel = (tabMode: InboxMode): string => {
    if (loadingModeSwitch && mode === tabMode) {
      return 'Loading...';
    }
    let label = '';
    let count: number | undefined;
    switch (tabMode) {
      case MODE_TRIAGE:
        label = t('inbox.triageTab');
        count = tabCounts?.triage;
        break;
      case MODE_ACTION:
        label = t('inbox.actionTab');
        count = tabCounts?.action;
        break;
      case MODE_FOLLOW_UP:
        label = t('inbox.followUpTab');
        count = tabCounts?.followUp;
        break;
      default:
        label = '';
    }
    // Show count for all tabs (including 0)
    if (count !== undefined) {
      return `${label} (${count})`;
    }
    return label;
  };

  return (
    <div style={getTabsRowStyle(isFullWidthRow)}>
      <button
        ref={triageTabRef}
        data-tour={TOUR_TARGETS.TRIAGE_TAB}
        className="triage-tab"
        onClick={() => handleTabClick('triage')}
        disabled={loadingModeSwitch}
        style={getTabStyle('triage')}
      >
        {getTabLabel('triage')}
      </button>
      <button
        ref={actionTabRef}
        data-tour={TOUR_TARGETS.ACTION_TAB}
        className={actionTabEmphasis ? `action-tab ${ACTION_TAB_EMPHASIS_CLASS[actionTabEmphasis]}` : 'action-tab'}
        onClick={() => handleTabClick('action')}
        disabled={loadingModeSwitch}
        style={{ ...getTabStyle('action'), position: 'relative' }}
        onAnimationEnd={event => endEmphasisOnOwnAnimation(event, actionTabEmphasis, onActionTabEmphasisEnd)}
      >
        {getTabLabel('action')}
        <MovedToActionBadge count={actionMovedCount} />
      </button>
      <button
        ref={followUpTabRef}
        className="follow-up-tab"
        onClick={() => handleTabClick('follow-up')}
        disabled={loadingModeSwitch}
        style={getTabStyle('follow-up')}
      >
        {getTabLabel('follow-up')}
      </button>
    </div>
  );
};
