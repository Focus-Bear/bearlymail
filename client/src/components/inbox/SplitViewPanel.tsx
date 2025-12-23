import React, { RefObject } from 'react';
import { theme } from '../../theme/theme';
import { EmailDetailInline } from '../EmailDetailInline';

interface SplitViewPanelProps {
  selectedEmailId: string;
  panelExpanded: boolean;
  splitPosition: number;
  isResizing: boolean;
  emailDetailRef: RefObject<HTMLDivElement | null>;
  onTogglePanel: () => void;
  onClose: () => void;
}

export const SplitViewPanel: React.FC<SplitViewPanelProps> = ({
  selectedEmailId,
  panelExpanded,
  splitPosition,
  isResizing,
  emailDetailRef,
  onTogglePanel,
  onClose,
}) => {
  return (
    <div 
      ref={emailDetailRef}
      tabIndex={0}
      style={{
        flex: panelExpanded ? 1 : `0 0 ${100 - splitPosition}%`,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: theme.colors.background.paper,
        borderLeft: `1px solid ${theme.colors.border.light}`,
        transition: isResizing ? 'none' : 'flex 0.3s ease',
        overflow: 'hidden',
      }}
    >
      {/* Panel Header with buttons */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: theme.spacing.md,
        borderBottom: `1px solid ${theme.colors.border.light}`,
        backgroundColor: theme.colors.background.subtle,
      }}>
        <div style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary }}>
          Email Details
        </div>
        <div style={{ display: 'flex', gap: theme.spacing.xs }}>
          <button
            onClick={onTogglePanel}
            style={{
              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
              backgroundColor: 'transparent',
              border: `1px solid ${theme.colors.border.medium}`,
              borderRadius: theme.borderRadius.sm,
              cursor: 'pointer',
              fontSize: theme.typography.fontSize.xs,
              color: theme.colors.text.secondary,
            }}
            title={panelExpanded ? 'Show split view' : 'Expand to full width'}
          >
            {panelExpanded ? '⛶' : '⛶'}
          </button>
          <button
            onClick={onClose}
            style={{
              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
              backgroundColor: 'transparent',
              border: `1px solid ${theme.colors.border.medium}`,
              borderRadius: theme.borderRadius.sm,
              cursor: 'pointer',
              fontSize: theme.typography.fontSize.xs,
              color: theme.colors.text.secondary,
            }}
            title="Close panel"
          >
            ✕
          </button>
        </div>
      </div>
      
      {/* EmailDetail component */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <EmailDetailInline emailId={selectedEmailId} onClose={onClose} />
      </div>
    </div>
  );
};

