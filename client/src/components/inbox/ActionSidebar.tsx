/**
 * ActionSidebar — the dedicated right-hand column in split-view email reading.
 *
 * Hosts the email's assistant surfaces (summary, scheduling, tasks, notes) under
 * an "Actions" tab and a mock "Ask AI" tab. The whole column collapses to a thin
 * icon rail so the email body can take the full width when the user wants to read.
 *
 * Presentational: the Actions tab body is injected via `actionsContent` so all the
 * email-detail state wiring stays in the parent (EmailDetail).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiChevronsRight, FiList, FiZap } from 'react-icons/fi';
import { theme } from 'theme/theme';

import { COLOR_TRANSPARENT } from 'constants/colors';
import { STRING_NONE, STRING_TRUE } from 'constants/strings';

const COLLAPSED_KEY = 'bearlymail-action-sidebar-collapsed';
const EXPANDED_WIDTH = 360;
const COLLAPSED_WIDTH = 48;

const TAB_ACTIONS = 'actions';
const TAB_ASK_AI = 'askAi';
type ActionSidebarTab = typeof TAB_ACTIONS | typeof TAB_ASK_AI;

interface ActionSidebarProps {
  /** Rendered body of the "Actions" tab — summary, scheduling, tasks, notes. */
  actionsContent: React.ReactNode;
  /** Rendered body of the "Ask AI" tab. */
  askAiContent: React.ReactNode;
}

interface TabButtonProps {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}

const TabButton: React.FC<TabButtonProps> = ({ active, label, icon, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: theme.spacing.xs,
      padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
      backgroundColor: COLOR_TRANSPARENT,
      border: STRING_NONE,
      borderBottom: `2px solid ${active ? theme.colors.primary.main : COLOR_TRANSPARENT}`,
      color: active ? theme.colors.text.primary : theme.colors.text.tertiary,
      fontSize: theme.typography.fontSize.sm,
      fontWeight: active ? theme.typography.fontWeight.semibold : theme.typography.fontWeight.medium,
      cursor: 'pointer',
    }}
  >
    {icon}
    {label}
  </button>
);

export const ActionSidebar: React.FC<ActionSidebarProps> = ({ actionsContent, askAiContent }) => {
  const { t } = useTranslation();
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === STRING_TRUE;
    } catch {
      return false;
    }
  });
  const [activeTab, setActiveTab] = useState<ActionSidebarTab>(TAB_ACTIONS);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_KEY, String(isCollapsed));
    } catch {
      // Ignore write errors (e.g. private browsing mode, storage disabled)
    }
  }, [isCollapsed]);

  const collapse = useCallback(() => setIsCollapsed(true), []);
  const expandTo = useCallback((tab: ActionSidebarTab) => {
    setActiveTab(tab);
    setIsCollapsed(false);
  }, []);

  if (isCollapsed) {
    return <CollapsedRail onExpand={expandTo} />;
  }

  return (
    <div
      aria-label={t('inbox.assistant.ariaLabel')}
      style={{
        flex: `0 0 ${EXPANDED_WIDTH}px`,
        maxWidth: `${EXPANDED_WIDTH}px`,
        display: 'flex',
        flexDirection: 'column',
        borderLeft: `1px solid ${theme.colors.border.light}`,
        backgroundColor: theme.colors.background.subtle,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.sm,
          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
          borderBottom: `1px solid ${theme.colors.border.light}`,
        }}
      >
        <TabButton
          active={activeTab === TAB_ACTIONS}
          label={t('inbox.assistant.actionsTab')}
          icon={<FiList size={14} />}
          onClick={() => setActiveTab(TAB_ACTIONS)}
        />
        <TabButton
          active={activeTab === TAB_ASK_AI}
          label={t('inbox.assistant.askAiTab')}
          icon={<FiZap size={14} />}
          onClick={() => setActiveTab(TAB_ASK_AI)}
        />
        <button
          type="button"
          onClick={collapse}
          title={t('inbox.assistant.collapse')}
          aria-label={t('inbox.assistant.collapse')}
          style={{
            marginLeft: 'auto',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: theme.spacing.xs,
            backgroundColor: COLOR_TRANSPARENT,
            border: STRING_NONE,
            borderRadius: theme.borderRadius.sm,
            color: theme.colors.text.tertiary,
            cursor: 'pointer',
          }}
        >
          <FiChevronsRight size={16} />
        </button>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: theme.spacing.sm,
        }}
      >
        {activeTab === TAB_ACTIONS ? actionsContent : askAiContent}
      </div>
    </div>
  );
};

const CollapsedRail: React.FC<{ onExpand: (tab: ActionSidebarTab) => void }> = ({ onExpand }) => {
  const { t } = useTranslation();
  return (
    <div
      aria-label={t('inbox.assistant.ariaLabel')}
      style={{
        flex: `0 0 ${COLLAPSED_WIDTH}px`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingTop: theme.spacing.sm,
        borderLeft: `1px solid ${theme.colors.border.light}`,
        backgroundColor: theme.colors.background.subtle,
      }}
    >
      <button
        type="button"
        onClick={() => onExpand(TAB_ACTIONS)}
        title={`${t('inbox.assistant.expand')} — ${t('inbox.assistant.actionsTab')}`}
        aria-label={`${t('inbox.assistant.expand')} — ${t('inbox.assistant.actionsTab')}`}
        style={railButtonStyle}
      >
        <FiList size={16} />
      </button>
      <button
        type="button"
        onClick={() => onExpand(TAB_ASK_AI)}
        title={`${t('inbox.assistant.expand')} — ${t('inbox.assistant.askAiTab')}`}
        aria-label={`${t('inbox.assistant.expand')} — ${t('inbox.assistant.askAiTab')}`}
        style={railButtonStyle}
      >
        <FiZap size={16} />
      </button>
    </div>
  );
};

const railButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '32px',
  height: '32px',
  borderRadius: theme.borderRadius.md,
  backgroundColor: COLOR_TRANSPARENT,
  border: STRING_NONE,
  color: theme.colors.text.tertiary,
  cursor: 'pointer',
};
