import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { ADMIN_TAB_WAITLIST, ADMIN_TAB_SUBSCRIPTIONS, ADMIN_TAB_JOBS, ADMIN_TAB_TOKEN_USAGE, ADMIN_TAB_QUEUE_DASHBOARD, ADMIN_TAB_GITHUB_DEBUG, AdminTab } from 'constants/adminTabs';

interface AdminTabsProps {
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
}

export const AdminTabs: React.FC<AdminTabsProps> = ({ activeTab, onTabChange }) => {
  const { t } = useTranslation();

  return (
    <div style={{
      display: 'flex',
      gap: theme.spacing.md,
      marginBottom: theme.spacing.xl,
      borderBottom: `2px solid ${theme.colors.border.light}`,
    }}>
      <button
        onClick={() => onTabChange(ADMIN_TAB_WAITLIST)}
        style={{
          padding: `${theme.spacing.md} ${theme.spacing.lg}`,
          backgroundColor: 'transparent',
          color: activeTab === ADMIN_TAB_WAITLIST ? theme.colors.primary.main : theme.colors.text.secondary,
          border: 'none',
          borderBottom: activeTab === ADMIN_TAB_WAITLIST ? `2px solid ${theme.colors.primary.main}` : '2px solid transparent',
          cursor: 'pointer',
          fontWeight: activeTab === ADMIN_TAB_WAITLIST ? theme.typography.fontWeight.semibold : 'normal',
          marginBottom: '-2px',
        }}
      >
        {t('admin.dashboard.waitlist')}
      </button>
      <button
        onClick={() => onTabChange(ADMIN_TAB_SUBSCRIPTIONS)}
        style={{
          padding: `${theme.spacing.md} ${theme.spacing.lg}`,
          backgroundColor: 'transparent',
          color: activeTab === ADMIN_TAB_SUBSCRIPTIONS ? theme.colors.primary.main : theme.colors.text.secondary,
          border: 'none',
          borderBottom: activeTab === ADMIN_TAB_SUBSCRIPTIONS ? `2px solid ${theme.colors.primary.main}` : '2px solid transparent',
          cursor: 'pointer',
          fontWeight: activeTab === ADMIN_TAB_SUBSCRIPTIONS ? theme.typography.fontWeight.semibold : 'normal',
          marginBottom: '-2px',
        }}
      >
        {t('admin.dashboard.subscriptions')}
      </button>
      <button
        onClick={() => onTabChange(ADMIN_TAB_JOBS)}
        style={{
          padding: `${theme.spacing.md} ${theme.spacing.lg}`,
          backgroundColor: 'transparent',
          color: activeTab === ADMIN_TAB_JOBS ? theme.colors.primary.main : theme.colors.text.secondary,
          border: 'none',
          borderBottom: activeTab === ADMIN_TAB_JOBS ? `2px solid ${theme.colors.primary.main}` : '2px solid transparent',
          cursor: 'pointer',
          fontWeight: activeTab === ADMIN_TAB_JOBS ? theme.typography.fontWeight.semibold : 'normal',
          marginBottom: '-2px',
        }}
      >
        {t('admin.dashboard.jobs')}
      </button>
      <button
        onClick={() => onTabChange(ADMIN_TAB_TOKEN_USAGE)}
        style={{
          padding: `${theme.spacing.md} ${theme.spacing.lg}`,
          backgroundColor: 'transparent',
          color: activeTab === ADMIN_TAB_TOKEN_USAGE ? theme.colors.primary.main : theme.colors.text.secondary,
          border: 'none',
          borderBottom: activeTab === ADMIN_TAB_TOKEN_USAGE ? `2px solid ${theme.colors.primary.main}` : '2px solid transparent',
          cursor: 'pointer',
          fontWeight: activeTab === ADMIN_TAB_TOKEN_USAGE ? theme.typography.fontWeight.semibold : 'normal',
          marginBottom: '-2px',
        }}
      >
        {t('admin.dashboard.tokenUsage')}
      </button>
      <button
        onClick={() => onTabChange(ADMIN_TAB_QUEUE_DASHBOARD)}
        style={{
          padding: `${theme.spacing.md} ${theme.spacing.lg}`,
          backgroundColor: 'transparent',
          color: activeTab === ADMIN_TAB_QUEUE_DASHBOARD ? theme.colors.primary.main : theme.colors.text.secondary,
          border: 'none',
          borderBottom: activeTab === ADMIN_TAB_QUEUE_DASHBOARD ? `2px solid ${theme.colors.primary.main}` : '2px solid transparent',
          cursor: 'pointer',
          fontWeight: activeTab === ADMIN_TAB_QUEUE_DASHBOARD ? theme.typography.fontWeight.semibold : 'normal',
          marginBottom: '-2px',
        }}
      >
        {t('admin.dashboard.queueDashboard')}
      </button>
      <button
        onClick={() => onTabChange(ADMIN_TAB_GITHUB_DEBUG)}
        style={{
          padding: `${theme.spacing.md} ${theme.spacing.lg}`,
          backgroundColor: 'transparent',
          color: activeTab === ADMIN_TAB_GITHUB_DEBUG ? theme.colors.primary.main : theme.colors.text.secondary,
          border: 'none',
          borderBottom: activeTab === ADMIN_TAB_GITHUB_DEBUG ? `2px solid ${theme.colors.primary.main}` : '2px solid transparent',
          cursor: 'pointer',
          fontWeight: activeTab === ADMIN_TAB_GITHUB_DEBUG ? theme.typography.fontWeight.semibold : 'normal',
          marginBottom: '-2px',
        }}
      >
        {t('admin.dashboard.githubDebug')}
      </button>
    </div>
  );
};

