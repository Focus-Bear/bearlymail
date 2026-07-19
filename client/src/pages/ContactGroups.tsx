import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { Sidebar } from 'components/inbox/Sidebar';
import { ContactGroupsSection } from 'components/settings/ContactGroupsSection';
import { EMOJI_MENU } from 'constants/emojis';
import { STRING_AUTO, STRING_CENTER, STRING_FIXED, STRING_FLEX, STRING_HIDDEN, STRING_POINTER } from 'constants/strings';
import { useAuth } from 'contexts/AuthContext';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';
import { useSidebarState } from 'hooks/useSidebarState';

const ContactGroupsPage: React.FC = () => {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const { isMobile, isTablet } = useResponsiveBreakpoints();
  const isNarrow = isMobile || isTablet;
  const { isCollapsed, canToggleCollapse, isMobileMenuOpen, toggleCollapse, openMobileMenu, closeMobileMenu } =
    useSidebarState({ alwaysToggleable: true });

  return (
    <div style={{ display: STRING_FLEX, height: '100vh', overflow: STRING_HIDDEN }}>
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
              position: STRING_FIXED,
              top: theme.spacing.md,
              left: theme.spacing.md,
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              border: `1px solid ${theme.colors.border.medium}`,
              backgroundColor: theme.colors.background.paper,
              cursor: STRING_POINTER,
              display: STRING_FLEX,
              alignItems: STRING_CENTER,
              justifyContent: STRING_CENTER,
              fontSize: '1.5rem',
              boxShadow: theme.shadows.md,
              zIndex: 100,
            }}
            aria-label="Open navigation menu"
          >
            {EMOJI_MENU}
          </button>
        )}
        <div style={{ maxWidth: '800px', margin: STRING_AUTO }}>
          <h1
            style={{
              ...theme.typography.heading.h3,
              color: theme.colors.text.primary,
              marginBottom: theme.spacing.lg,
            }}
          >
            {t('crm.contactGroups')}
          </h1>
          <ContactGroupsSection />
        </div>
      </div>
    </div>
  );
};

export default ContactGroupsPage;
