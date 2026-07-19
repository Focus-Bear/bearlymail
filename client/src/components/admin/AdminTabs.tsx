import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import {
  ADMIN_TAB_CONTACTS_DEBUG,
  ADMIN_TAB_CONTEXT_ANALYSIS,
  ADMIN_TAB_EMAIL_DECRYPT,
  ADMIN_TAB_FEEDBACK,
  ADMIN_TAB_GITHUB_DEBUG,
  ADMIN_TAB_JOBS,
  ADMIN_TAB_LOCAL_MODEL,
  ADMIN_TAB_QUEUE_DASHBOARD,
  ADMIN_TAB_REENCRYPTION,
  ADMIN_TAB_SUBSCRIPTIONS,
  ADMIN_TAB_TOKEN_USAGE,
  ADMIN_TAB_WAITLIST,
  AdminTab,
} from 'constants/adminTabs';
import { MARGIN_BOTTOM_NEG_2PX } from 'constants/numbers';
import { FONT_WEIGHT_NORMAL, STRING_NONE } from 'constants/strings';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';

interface AdminTabsProps {
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
}

interface TabButtonProps {
  tab: AdminTab;
  activeTab: AdminTab;
  label: string;
  onClick: (tab: AdminTab) => void;
}

const TabButton: React.FC<TabButtonProps> = ({ tab, activeTab, label, onClick }) => {
  const isActive = activeTab === tab;
  return (
    <button
      onClick={() => onClick(tab)}
      style={{
        padding: `${theme.spacing.md} ${theme.spacing.lg}`,
        backgroundColor: theme.colors.common.transparent,
        color: isActive ? theme.colors.primary.main : theme.colors.text.secondary,
        border: STRING_NONE,
        borderBottom: isActive
          ? `2px solid ${theme.colors.primary.main}`
          : `2px solid ${theme.colors.common.transparent}`,
        cursor: 'pointer',
        fontWeight: isActive ? theme.typography.fontWeight.semibold : FONT_WEIGHT_NORMAL,
        marginBottom: MARGIN_BOTTOM_NEG_2PX,
      }}
    >
      {label}
    </button>
  );
};

export const AdminTabs: React.FC<AdminTabsProps> = ({ activeTab, onTabChange }) => {
  const { t } = useTranslation();
  const { isDesktop } = useResponsiveBreakpoints();

  const tabs = [
    { id: ADMIN_TAB_WAITLIST, label: t('admin.dashboard.waitlist') },
    { id: ADMIN_TAB_SUBSCRIPTIONS, label: t('admin.dashboard.subscriptions') },
    { id: ADMIN_TAB_JOBS, label: t('admin.dashboard.jobs') },
    { id: ADMIN_TAB_TOKEN_USAGE, label: t('admin.dashboard.tokenUsage') },
    { id: ADMIN_TAB_LOCAL_MODEL, label: t('admin.dashboard.localModel') },
    { id: ADMIN_TAB_QUEUE_DASHBOARD, label: t('admin.dashboard.queueDashboard') },
    { id: ADMIN_TAB_GITHUB_DEBUG, label: t('admin.dashboard.githubDebug') },
    { id: ADMIN_TAB_CONTEXT_ANALYSIS, label: t('admin.dashboard.contextAnalysis') },
    { id: ADMIN_TAB_FEEDBACK, label: t('admin.dashboard.feedback') },
    { id: ADMIN_TAB_EMAIL_DECRYPT, label: t('admin.dashboard.emailDecrypt') },
    { id: ADMIN_TAB_REENCRYPTION, label: t('admin.dashboard.reencryption') },
    { id: ADMIN_TAB_CONTACTS_DEBUG, label: 'Contacts debug' },
  ];

  // On narrow screens the 12-tab row overflows horizontally and gets cut off, so
  // collapse it into a full-width dropdown instead.
  if (!isDesktop) {
    return (
      <div style={{ marginBottom: theme.spacing.xl }}>
        <select
          aria-label={t('admin.dashboard.selectSection')}
          value={activeTab}
          onChange={event => onTabChange(event.target.value as AdminTab)}
          style={{
            width: '100%',
            padding: theme.spacing.md,
            fontSize: theme.typography.fontSize.base,
            fontWeight: theme.typography.fontWeight.semibold,
            color: theme.colors.primary.main,
            backgroundColor: theme.colors.background.paper,
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.md,
          }}
        >
          {tabs.map(tab => (
            <option key={tab.id} value={tab.id}>
              {tab.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: theme.spacing.md,
        marginBottom: theme.spacing.xl,
        borderBottom: `2px solid ${theme.colors.border.light}`,
      }}
    >
      {tabs.map(tab => (
        <TabButton key={tab.id} tab={tab.id} activeTab={activeTab} label={tab.label} onClick={onTabChange} />
      ))}
    </div>
  );
};
