import { useState, useEffect } from 'react';

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
      setIsMobile(width < 640);
      setIsTablet(width >= 640 && width < 1280);
    };

    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  return { isMobile, isTablet, isDesktop: !isMobile && !isTablet };
};



