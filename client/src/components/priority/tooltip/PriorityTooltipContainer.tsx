import React from 'react';
import { theme } from 'theme/theme';
import { Z_INDEX_MODAL_OVERLAY, TOOLTIP_MIN_WIDTH_SMALL, TOOLTIP_MAX_WIDTH_SMALL, VIEWPORT_HEIGHT_75 } from 'constants/numbers';

interface PriorityTooltipContainerProps {
  emailId: string;
  children: React.ReactNode;
  minWidth?: string;
  maxWidth?: string;
}

export const PriorityTooltipContainer: React.FC<PriorityTooltipContainerProps> = ({
  emailId,
  children,
  minWidth = `${TOOLTIP_MIN_WIDTH_SMALL}px`,
  maxWidth = `${TOOLTIP_MAX_WIDTH_SMALL}px`,
}) => {
  return (
    <div
      data-priority-tooltip={emailId}
      style={{
        position: 'fixed',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        backgroundColor: theme.colors.background.paper,
        border: `1px solid ${theme.colors.border.light}`,
        borderRadius: theme.borderRadius.md,
        padding: theme.spacing.md,
        boxShadow: theme.shadows.xl,
        zIndex: Z_INDEX_MODAL_OVERLAY,
        minWidth,
        maxWidth,
        maxHeight: VIEWPORT_HEIGHT_75,
        overflowY: 'auto',
        fontSize: theme.typography.fontSize.xs,
        color: theme.colors.text.primary,
        textAlign: 'left',
      }}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
    >
      {children}
    </div>
  );
};



