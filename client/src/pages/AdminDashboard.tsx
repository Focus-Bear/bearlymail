import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from 'contexts/AuthContext';
import { theme } from 'theme/theme';
import { useAdminDashboard } from 'hooks/useAdminDashboard';
import { AdminDashboardHeader } from 'components/admin/AdminDashboardHeader';
import { AdminTabs } from 'components/admin/AdminTabs';
import { WaitlistSection } from 'components/admin/WaitlistSection';
import { SubscriptionsSection } from 'components/admin/SubscriptionsSection';
import { JobsSection } from 'components/admin/JobsSection';
import { TokenUsageSection } from 'components/admin/TokenUsageSection';
import { ADMIN_TAB_WAITLIST, ADMIN_TAB_JOBS, ADMIN_TAB_TOKEN_USAGE } from 'constants/adminTabs';

const DEFAULT_EXTEND_DAYS = 7;

const AdminDashboard: React.FC = () => {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const {
    activeTab,
    setActiveTab,
    loading,
    extendingUserId,
    setExtendingUserId,
    extendDays,
    setExtendDays,
    handleExtendTrial,
    handleApprove,
    handleDecline,
    pending,
    approved,
    users,
  } = useAdminDashboard();

  const renderContent = () => {
    if (loading && activeTab !== ADMIN_TAB_JOBS && activeTab !== ADMIN_TAB_TOKEN_USAGE) {
      return (
        <div style={{ textAlign: 'center', padding: theme.spacing['3xl'] }}>
          {t('admin.dashboard.loading')}
        </div>
      );
    }
    if (activeTab === ADMIN_TAB_WAITLIST) {
      return (
        <WaitlistSection
          pending={pending}
          approved={approved}
          onApprove={handleApprove}
          onDecline={handleDecline}
        />
      );
    }
    if (activeTab === ADMIN_TAB_JOBS) {
      return <JobsSection />;
    }
    if (activeTab === ADMIN_TAB_TOKEN_USAGE) {
      return <TokenUsageSection />;
    }
    return (
      <SubscriptionsSection
        users={users}
        extendingUserId={extendingUserId}
        extendDays={extendDays}
        onExtendClick={setExtendingUserId}
        onExtendCancel={() => {
          setExtendingUserId(null);
          setExtendDays(DEFAULT_EXTEND_DAYS);
        }}
        onExtendTrial={handleExtendTrial}
        onExtendDaysChange={setExtendDays}
      />
    );
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: theme.colors.background.default,
      padding: theme.spacing.xl,
    }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
      }}>
        <AdminDashboardHeader onLogout={logout} />
        <AdminTabs activeTab={activeTab} onTabChange={setActiveTab} />
        {renderContent()}
      </div>
    </div>
  );
};

export default AdminDashboard;
