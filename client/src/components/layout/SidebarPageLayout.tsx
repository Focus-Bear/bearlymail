import React from 'react';
import { theme } from 'theme/theme';

import { Sidebar } from 'components/inbox/Sidebar';
import { MobileMenuButton } from 'components/layout/MobileMenuButton';
import { useAuth } from 'contexts/AuthContext';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';
import { useSidebarState } from 'hooks/useSidebarState';

interface SidebarPageLayoutProps {
  children: React.ReactNode;
  /**
   * When true the scroll area gets no horizontal padding, so the page can
   * render its own full-width header (e.g. the Search page). Narrow viewports
   * keep top padding so content clears the floating mobile menu button.
   */
  fullBleed?: boolean;
}

/**
 * Standard page shell for every page outside the inbox: navigation sidebar
 * (with collapse toggle and mobile drawer) next to a scrollable content area.
 * Keeps the main navigation reachable so users are never "trapped" on a page.
 */
export const SidebarPageLayout: React.FC<SidebarPageLayoutProps> = ({ children, fullBleed = false }) => {
  const { user, logout } = useAuth();
  const { isMobile, isTablet } = useResponsiveBreakpoints();
  const isNarrow = isMobile || isTablet;
  const { isCollapsed, canToggleCollapse, isMobileMenuOpen, toggleCollapse, openMobileMenu, closeMobileMenu } =
    useSidebarState({ alwaysToggleable: true });

  const narrowPadding = fullBleed ? '70px 0 0' : `70px ${theme.spacing.sm} ${theme.spacing.md}`;
  const widePadding = fullBleed ? 0 : theme.spacing.xl;

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        overflow: 'hidden',
        backgroundColor: theme.colors.background.default,
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
          padding: isNarrow ? narrowPadding : widePadding,
          position: 'relative',
        }}
      >
        {isNarrow && <MobileMenuButton onClick={openMobileMenu} />}
        {children}
      </div>
    </div>
  );
};
