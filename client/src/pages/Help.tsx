import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { BackToInboxLink } from 'components/common/BackToInboxLink';
import { HelpFeedbackBanner } from 'components/feedback/HelpFeedbackBanner';
import { HelpArticleBrowser } from 'components/help/HelpArticleBrowser';
import { ReplayTourCard } from 'components/help/ReplayTourCard';
import { Sidebar } from 'components/inbox/Sidebar';
import { useAuth } from 'contexts/AuthContext';
import { useSidebarState } from 'hooks/useSidebarState';

const Help: React.FC = () => {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const { isCollapsed, canToggleCollapse, isMobileMenuOpen, toggleCollapse, closeMobileMenu } = useSidebarState({
    alwaysToggleable: true,
  });
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar
        user={user}
        logout={logout}
        isCollapsed={isCollapsed}
        canToggleCollapse={canToggleCollapse}
        onToggleCollapse={toggleCollapse}
        isMobileMenuOpen={isMobileMenuOpen}
        onCloseMobileMenu={closeMobileMenu}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: theme.spacing.xl }}>
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ marginBottom: theme.spacing.lg }}>
              <BackToInboxLink />
            </div>

            <h1
              style={{
                color: theme.colors.text.primary,
                fontSize: theme.typography.fontSize['3xl'],
                marginBottom: theme.spacing.sm,
                fontWeight: theme.typography.fontWeight.bold,
              }}
            >
              {t('help.title')}
            </h1>

            <p
              style={{
                color: theme.colors.text.secondary,
                fontSize: theme.typography.fontSize.base,
                marginBottom: theme.spacing.xl,
                lineHeight: theme.typography.lineHeight.relaxed,
              }}
            >
              {t('help.description')}
            </p>

            <HelpArticleBrowser>
              <HelpFeedbackBanner />
              <ReplayTourCard />
            </HelpArticleBrowser>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Help;
