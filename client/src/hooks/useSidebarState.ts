import { useCallback, useEffect, useRef, useState } from 'react';

import { STRING_TRUE } from 'constants/strings';

const SIDEBAR_EXPANDED_KEY = 'bearlymail-sidebar-expanded';

interface UseSidebarStateOptions {
  splitViewActive?: boolean;
  /**
   * When true the collapse/expand toggle is always available and the persisted
   * collapse state is respected. Standard sidebar pages (Settings, Stats, etc.)
   * pass this; the Inbox keeps the split-view-driven behaviour instead.
   */
  alwaysToggleable?: boolean;
}

interface UseSidebarStateReturn {
  isCollapsed: boolean;
  /** True when the collapse/expand toggle is meaningful (split view active or an always-toggleable page). */
  canToggleCollapse: boolean;
  isMobileMenuOpen: boolean;
  toggleCollapse: () => void;
  openMobileMenu: () => void;
  closeMobileMenu: () => void;
}

export function useSidebarState(options: UseSidebarStateOptions = {}): UseSidebarStateReturn {
  const { splitViewActive = false, alwaysToggleable = false } = options;

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
    // Toggle works on always-toggleable pages and when split view is active
    if (splitViewActive || alwaysToggleable) {
      setManuallyExpanded(prev => !prev);
    }
  }, [splitViewActive, alwaysToggleable]);

  const openMobileMenu = useCallback(() => {
    setIsMobileMenuOpen(true);
  }, []);

  const closeMobileMenu = useCallback(() => {
    setIsMobileMenuOpen(false);
  }, []);

  // Sidebar should respect manual collapse state when:
  // 1. Split view is active on Inbox page, OR
  // 2. The page opted in via alwaysToggleable (standard sidebar pages)
  // Otherwise, sidebar is always expanded
  const shouldRespectCollapseState = splitViewActive || alwaysToggleable;
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
