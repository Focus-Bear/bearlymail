import React from 'react';
import { theme } from 'theme/theme';

import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';

interface WaitlistFormContainerProps {
  children: React.ReactNode;
}

/**
 * Container component for waitlist form with responsive positioning
 */
export const WaitlistFormContainer: React.FC<WaitlistFormContainerProps> = ({ children }) => {
  const { isMobile, isTablet } = useResponsiveBreakpoints();

  const getPosition = (): 'static' | 'sticky' => {
    if (isMobile || isTablet) {
      return 'static';
    }
    return 'sticky';
  };

  const getTop = (): string => {
    if (isMobile || isTablet) {
      return 'auto';
    }
    return theme.spacing.xl;
  };

  const getMaxHeight = (): string => {
    if (isMobile || isTablet) {
      return 'none';
    }
    return 'calc(100vh - 2rem)';
  };

  const getOverflowY = (): 'visible' | 'auto' => {
    if (isMobile || isTablet) {
      return 'visible';
    }
    return 'auto';
  };

  const getPadding = (): string => {
    if (isMobile) {
      return theme.spacing.lg;
    }
    if (isTablet) {
      return theme.spacing.lg;
    }
    return theme.spacing['2xl'];
  };

  return (
    <div
      id="waitlist-form"
      style={{
        position: getPosition(),
        top: getTop(),
        order: 0,
        maxWidth: '100%',
        margin: '0',
        width: '100%',
        minWidth: 0,
        maxHeight: getMaxHeight(),
        overflowY: getOverflowY(),
        overflowX: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      <section
        style={{
          backgroundColor: theme.colors.background.paper,
          padding: getPadding(),
          borderRadius: theme.borderRadius.lg,
          boxShadow: theme.shadows.lg,
          width: '100%',
          boxSizing: 'border-box',
          maxWidth: '100%',
        }}
      >
        {children}
      </section>
    </div>
  );
};
