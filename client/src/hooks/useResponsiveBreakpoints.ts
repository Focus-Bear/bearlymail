import { useEffect, useState } from 'react';

import { BREAKPOINT_DESKTOP, BREAKPOINT_TABLET } from 'constants/numbers';

/**
 * Custom hook to detect responsive breakpoints
 *
 * Returns:
 * - isMobile: true when width < 640px
 * - isTablet: true when width >= 640px and < 1280px
 * - isDesktop: true when width >= 1280px
 *
 * @returns Object with responsive breakpoint flags
 */
export const useResponsiveBreakpoints = () => {
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);

  useEffect(() => {
    const checkScreenSize = () => {
      const width = window.innerWidth;
      setIsMobile(width < BREAKPOINT_TABLET);
      setIsTablet(width >= BREAKPOINT_TABLET && width < BREAKPOINT_DESKTOP);
    };

    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  return { isMobile, isTablet, isDesktop: !isMobile && !isTablet };
};
