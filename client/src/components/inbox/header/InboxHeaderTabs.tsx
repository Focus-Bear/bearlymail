import React, { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { InboxMode } from 'types/email';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { OPACITY_DISABLED, OPACITY_FULL } from 'constants/numbers';
import { MODE_ACTION, MODE_FOLLOW_UP, MODE_TRIAGE, STRING_NONE } from 'constants/strings';
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
  /** When true, pulses the Action tab to signal an email moved there (mobile only) */
  actionTabPulsing?: boolean;
  onActionTabPulseEnd?: () => void;
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
  actionTabPulsing,
  onActionTabPulseEnd,
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

  const getTabStyle = (tabMode: InboxMode) => {
    const isActive = mode === tabMode;
    return {
      padding: isMobile ? `${theme.spacing.xs} ${theme.spacing.sm}` : `${theme.spacing.sm} ${theme.spacing.lg}`,
      backgroundColor: isActive ? theme.colors.primary.subtle : 'transparent',
      color: isActive ? theme.colors.primary.main : theme.colors.text.secondary,
      border: STRING_NONE,
      borderRadius: theme.borderRadius.full,
      cursor: loadingModeSwitch ? 'wait' : 'pointer',
      fontWeight: theme.typography.fontWeight.semibold,
      fontSize: isMobile ? theme.typography.fontSize.lg : theme.typography.fontSize.base,
      opacity: loadingModeSwitch ? OPACITY_DISABLED : OPACITY_FULL,
    };
  };

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
    <div style={{ display: 'flex', gap: isMobile ? theme.spacing.xs : theme.spacing.md }}>
      <button
        ref={triageTabRef}
        className="triage-tab"
        onClick={() => handleTabClick('triage')}
        disabled={loadingModeSwitch}
        style={getTabStyle('triage')}
      >
        {getTabLabel('triage')}
      </button>
      <button
        ref={actionTabRef}
        className={`action-tab${actionTabPulsing ? ' animate-tab-pulse' : ''}`}
        onClick={() => handleTabClick('action')}
        disabled={loadingModeSwitch}
        style={getTabStyle('action')}
        onAnimationEnd={actionTabPulsing ? onActionTabPulseEnd : undefined}
      >
        {getTabLabel('action')}
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
