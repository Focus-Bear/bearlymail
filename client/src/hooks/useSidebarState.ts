import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { STRING_TRUE } from 'constants/strings';

const SIDEBAR_EXPANDED_KEY = 'bearlymail-sidebar-expanded';

interface UseSidebarStateOptions {
  splitViewActive?: boolean;
}

interface UseSidebarStateReturn {
  isCollapsed: boolean;
  /** True when the collapse/expand toggle is meaningful (split view active or Settings page). */
  canToggleCollapse: boolean;
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

  // Auto-collapse the nav the moment an email opens (split view goes inactive → active).
  // Without this, the persisted manuallyExpanded=true from a previous session would keep
  // the rail expanded, leaving no room for the email + action sidebar.
  const prevSplitViewActive = useRef(splitViewActive);
  useEffect(() => {
    if (splitViewActive && !prevSplitViewActive.current) {
      setManuallyExpanded(false);
    }
    prevSplitViewActive.current = splitViewActive;
  }, [splitViewActive]);

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
    canToggleCollapse: shouldRespectCollapseState,
    isMobileMenuOpen,
    toggleCollapse,
    openMobileMenu,
    closeMobileMenu,
  };
}
