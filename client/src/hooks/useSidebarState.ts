import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';

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
    return stored === 'true';
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_EXPANDED_KEY, String(manuallyExpanded));
  }, [manuallyExpanded]);

  const toggleCollapse = useCallback(() => {
    if (splitViewActive) {
      setManuallyExpanded(prev => !prev);
    }
  }, [splitViewActive]);

  const openMobileMenu = useCallback(() => {
    setIsMobileMenuOpen(true);
  }, []);

  const closeMobileMenu = useCallback(() => {
    setIsMobileMenuOpen(false);
  }, []);

  const isCollapsed = splitViewActive && !isSettingsPage ? !manuallyExpanded : false;

  return {
    isCollapsed,
    isMobileMenuOpen,
    toggleCollapse,
    openMobileMenu,
    closeMobileMenu,
  };
}
