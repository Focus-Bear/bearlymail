import React from 'react';
import { createPortal } from 'react-dom';
import { theme } from 'theme/theme';

import {
  TOOLTIP_MAX_WIDTH_SMALL,
  TOOLTIP_MIN_WIDTH_SMALL,
  VIEWPORT_HEIGHT_75,
  Z_INDEX_MODAL_OVERLAY,
} from 'constants/numbers';

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
  const tooltipContent = (
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
      onClick={event => {
        // Keep the click inside the tooltip (don't bubble to row/close handlers)
        // but DON'T preventDefault — that would block text selection.
        event.stopPropagation();
      }}
      onMouseDown={event => {
        // stopPropagation keeps the tooltip open; preventDefault is omitted so
        // the user can click-drag to select (and copy) the category text.
        event.stopPropagation();
      }}
    >
      {children}
    </div>
  );

  // Use portal to render tooltip at document body level, escaping any overflow:hidden containers
  return createPortal(tooltipContent, document.body);
};
