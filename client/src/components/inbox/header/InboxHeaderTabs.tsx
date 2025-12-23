import React, { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from '../../../theme/theme';
import { InboxMode } from '../../../types/email';
import { captureEvent } from '../../../utils/posthog';

interface InboxHeaderTabsProps {
  mode: InboxMode;
  setMode: (mode: InboxMode) => void;
  loadingModeSwitch: boolean;
  triageTabRef: RefObject<HTMLButtonElement | null>;
  actionTabRef: RefObject<HTMLButtonElement | null>;
  followUpTabRef: RefObject<HTMLButtonElement | null>;
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
}) => {
  const { t } = useTranslation();

  const handleTabClick = (newMode: InboxMode) => {
    if (mode !== newMode) {
      captureEvent('inbox_mode_changed', {
        from_mode: mode,
        to_mode: newMode,
      });
      setMode(newMode);
    }
  };

  const getTabStyle = (tabMode: InboxMode) => {
    const isActive = mode === tabMode;
    return {
      padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
      backgroundColor: isActive ? theme.colors.primary.subtle : 'transparent',
      color: isActive ? theme.colors.primary.main : theme.colors.text.secondary,
      border: 'none',
      borderRadius: theme.borderRadius.full,
      cursor: loadingModeSwitch ? 'wait' : 'pointer',
      fontWeight: theme.typography.fontWeight.semibold,
      fontSize: theme.typography.fontSize.base,
      opacity: loadingModeSwitch ? 0.6 : 1,
    };
  };

  const getTabLabel = (tabMode: InboxMode): string => {
    if (loadingModeSwitch && mode === tabMode) {
      return 'Loading...';
    }
    switch (tabMode) {
      case 'triage':
        return t('inbox.triageTab');
      case 'action':
        return t('inbox.actionTab');
      case 'follow-up':
        return t('inbox.followUpTab');
      default:
        return '';
    }
  };

  return (
    <div style={{ display: 'flex', gap: theme.spacing.md }}>
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
        className="action-tab"
        onClick={() => handleTabClick('action')}
        disabled={loadingModeSwitch}
        style={getTabStyle('action')}
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

