import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { AdminDashboardHeader } from 'components/admin/AdminDashboardHeader';
import { AdminTabs } from 'components/admin/AdminTabs';
import { ContactSearchDebugSection } from 'components/admin/ContactSearchDebugSection';
import { ContextAnalysisSection } from 'components/admin/ContextAnalysisSection';
import { EmailDecryptSection } from 'components/admin/EmailDecryptSection';
import { FeedbackSection } from 'components/admin/FeedbackSection';
import { GitHubDebugSection } from 'components/admin/GitHubDebugSection';
import { JobsSection } from 'components/admin/JobsSection';
import { LocalModelUsageSection } from 'components/admin/LocalModelUsageSection';
import { QueueDashboardSection } from 'components/admin/QueueDashboardSection';
import { ReencryptionSection } from 'components/admin/ReencryptionSection';
import { SubscriptionsSection } from 'components/admin/SubscriptionsSection';
import { TokenUsageSection } from 'components/admin/TokenUsageSection';
import { WaitlistSection } from 'components/admin/WaitlistSection';
import { Sidebar } from 'components/inbox/Sidebar';
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
  ADMIN_TAB_TOKEN_USAGE,
  ADMIN_TAB_WAITLIST,
} from 'constants/adminTabs';
import { EMOJI_MENU } from 'constants/emojis';
import { useAuth } from 'contexts/AuthContext';
import { useAdminDashboard } from 'hooks/useAdminDashboard';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';
import { useSidebarState } from 'hooks/useSidebarState';

const DEFAULT_EXTEND_DAYS = 7;

const AdminDashboard: React.FC = () => {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const { isMobile, isTablet } = useResponsiveBreakpoints();
  const isNarrow = isMobile || isTablet;
  const { isCollapsed, canToggleCollapse, isMobileMenuOpen, toggleCollapse, openMobileMenu, closeMobileMenu } =
    useSidebarState({ alwaysToggleable: true });
  const {
    activeTab,
    setActiveTab,
    loading,
    extendingUserId,
    setExtendingUserId,
    extendDays,
    setExtendDays,
    handleExtendTrial,
    grantingUserId,
    setGrantingUserId,
    handleGrantPlan,
    handleRevokePlan,
    handleResetUsage,
    handleUsersPageChange,
    handleApprove,
    handleDecline,
    pending,
    approved,
    users,
    usersPage,
    usersTotalPages,
    usersTotal,
  } = useAdminDashboard();

  // eslint-disable-next-line complexity -- linear tab dispatch; each new admin section adds one branch.
  const renderContent = () => {
    if (
      loading &&
      activeTab !== ADMIN_TAB_JOBS &&
      activeTab !== ADMIN_TAB_TOKEN_USAGE &&
      activeTab !== ADMIN_TAB_LOCAL_MODEL &&
      activeTab !== ADMIN_TAB_QUEUE_DASHBOARD &&
      activeTab !== ADMIN_TAB_GITHUB_DEBUG &&
      activeTab !== ADMIN_TAB_CONTEXT_ANALYSIS &&
      activeTab !== ADMIN_TAB_FEEDBACK &&
      activeTab !== ADMIN_TAB_EMAIL_DECRYPT &&
      activeTab !== ADMIN_TAB_REENCRYPTION &&
      activeTab !== ADMIN_TAB_CONTACTS_DEBUG
    ) {
      return <div style={{ textAlign: 'center', padding: theme.spacing['3xl'] }}>{t('admin.dashboard.loading')}</div>;
    }
    if (activeTab === ADMIN_TAB_WAITLIST) {
      return (
        <WaitlistSection pending={pending} approved={approved} onApprove={handleApprove} onDecline={handleDecline} />
      );
    }
    if (activeTab === ADMIN_TAB_JOBS) {
      return <JobsSection />;
    }
    if (activeTab === ADMIN_TAB_TOKEN_USAGE) {
      return <TokenUsageSection />;
    }
    if (activeTab === ADMIN_TAB_LOCAL_MODEL) {
      return <LocalModelUsageSection />;
    }
    if (activeTab === ADMIN_TAB_QUEUE_DASHBOARD) {
      return <QueueDashboardSection />;
    }
    if (activeTab === ADMIN_TAB_GITHUB_DEBUG) {
      return <GitHubDebugSection />;
    }
    if (activeTab === ADMIN_TAB_CONTEXT_ANALYSIS) {
      return <ContextAnalysisSection />;
    }
    if (activeTab === ADMIN_TAB_FEEDBACK) {
      return <FeedbackSection />;
    }
    if (activeTab === ADMIN_TAB_EMAIL_DECRYPT) {
      return <EmailDecryptSection />;
    }
    if (activeTab === ADMIN_TAB_REENCRYPTION) {
      return <ReencryptionSection />;
    }
    if (activeTab === ADMIN_TAB_CONTACTS_DEBUG) {
      return <ContactSearchDebugSection />;
    }
    return (
      <SubscriptionsSection
        users={users}
        usersTotal={usersTotal}
        usersPage={usersPage}
        usersTotalPages={usersTotalPages}
        extendingUserId={extendingUserId}
        extendDays={extendDays}
        onExtendClick={setExtendingUserId}
        onExtendCancel={() => {
          setExtendingUserId(null);
          setExtendDays(DEFAULT_EXTEND_DAYS);
        }}
        onExtendTrial={handleExtendTrial}
        onExtendDaysChange={setExtendDays}
        onPageChange={handleUsersPageChange}
        grantingUserId={grantingUserId}
        onGrantClick={setGrantingUserId}
        onGrantCancel={() => setGrantingUserId(null)}
        onGrantPlan={handleGrantPlan}
        onRevokePlan={handleRevokePlan}
        onResetUsage={handleResetUsage}
      />
    );
  };

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        overflow: 'hidden',
      }}
    >
      <Sidebar
        user={user}
        logout={logout}
        isCollapsed={isCollapsed}
        canToggleCollapse={canToggleCollapse}
        onToggleCollapse={toggleCollapse}
        isMobileMenuOpen={isMobileMenuOpen}
        onCloseMobileMenu={closeMobileMenu}
      />

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          backgroundColor: theme.colors.background.default,
          padding: isNarrow ? `70px ${theme.spacing.sm} ${theme.spacing.md}` : theme.spacing.xl,
        }}
      >
        {isNarrow && (
          <button
            onClick={openMobileMenu}
            style={{
              position: 'fixed',
              top: theme.spacing.md,
              left: theme.spacing.md,
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              border: `1px solid ${theme.colors.border.medium}`,
              backgroundColor: theme.colors.background.paper,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.5rem',
              transition: theme.transitions.fast,
              boxShadow: theme.shadows.md,
              zIndex: 100,
            }}
            aria-label="Open navigation menu"
          >
            {EMOJI_MENU}
          </button>
        )}

        <div
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
          }}
        >
          <AdminDashboardHeader onLogout={logout} />
          <AdminTabs activeTab={activeTab} onTabChange={setActiveTab} />
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
