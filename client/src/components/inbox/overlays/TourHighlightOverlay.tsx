import React from 'react';
import { theme } from 'theme/theme';

interface TourHighlightOverlayProps {
  targetElement: HTMLElement;
}

export const TourHighlightOverlay: React.FC<TourHighlightOverlayProps> = ({ targetElement }) => {
  const rect = targetElement.getBoundingClientRect();

  return (
    <div
      style={{
        position: 'fixed',
        top: rect.top - 4,
        left: rect.left - 4,
        width: rect.width + 8,
        height: rect.height + 8,
        border: `3px solid ${theme.colors.primary.main}`,
        borderRadius: theme.borderRadius.full,
        boxShadow: `0 0 0 4px ${theme.colors.overlay.blueTint}`,
        pointerEvents: 'none',
        zIndex: 1001,
      }}
    />
  );
};
