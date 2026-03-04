import { useCallback,useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { STRING_TRUE } from 'constants/strings';

const SIDEBAR_EXPANDED_KEY = 'bearlymail-sidebar-expanded';

interface UseSidebarStateOptions {
  splitViewActive?: boolean;
}

interface UseSidebarStateReturn {
  isCollapsed: boolean;
  isMobileMenuOpen: boolean;
  toggleCollapse: () => void;
  openMobileMenu: () => void;
  closeMobileMenu: () => void;
}

export function useSidebarState(options: UseSidebarStateOptions = {}): UseSidebarStateReturn {
  const { splitViewActive = false } = options;
  const location = useLocation();
  const isSettingsPage = location.pathname.startsWith('/settings');
  
  const [manuallyExpanded, setManuallyExpanded] = useState<boolean>(() => {
    const stored = localStorage.getItem(SIDEBAR_EXPANDED_KEY);
    return stored === STRING_TRUE;
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_EXPANDED_KEY, String(manuallyExpanded));
  }, [manuallyExpanded]);

  const toggleCollapse = useCallback(() => {
    // Toggle should work on Settings page and when split view is active
    if (splitViewActive || isSettingsPage) {
      setManuallyExpanded(prev => !prev);
    }
  }, [splitViewActive, isSettingsPage]);

  const openMobileMenu = useCallback(() => {
    setIsMobileMenuOpen(true);
  }, []);

  const closeMobileMenu = useCallback(() => {
    setIsMobileMenuOpen(false);
  }, []);

  // Sidebar should respect manual collapse state when:
  // 1. Split view is active on Inbox page, OR
  // 2. User is on Settings page
  // Otherwise, sidebar is always expanded
  const shouldRespectCollapseState = splitViewActive || isSettingsPage;
  const isCollapsed = shouldRespectCollapseState ? !manuallyExpanded : false;

  return {
    isCollapsed,
    isMobileMenuOpen,
    toggleCollapse,
    openMobileMenu,
    closeMobileMenu,
  };
}
