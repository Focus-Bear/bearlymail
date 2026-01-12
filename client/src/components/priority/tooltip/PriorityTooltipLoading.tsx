import React from 'react';
import { theme } from 'theme/theme';
import { Z_INDEX_MODAL_OVERLAY, TOOLTIP_MIN_WIDTH_MEDIUM, TOOLTIP_MAX_WIDTH_MEDIUM } from 'constants/numbers';

interface PriorityTooltipLoadingProps {
  emailId: string;
}

export const PriorityTooltipLoading: React.FC<PriorityTooltipLoadingProps> = ({ emailId }) => {
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
        minWidth: `${TOOLTIP_MIN_WIDTH_MEDIUM}px`,
        maxWidth: `${TOOLTIP_MAX_WIDTH_MEDIUM}px`,
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
      <div style={{ textAlign: 'center', padding: theme.spacing.md }}>
        Loading priority explanation...
      </div>
    </div>
  );
};



