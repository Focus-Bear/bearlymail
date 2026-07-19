import React from 'react';
import { FiChevronDown, FiChevronUp, FiX } from 'react-icons/fi';
import { theme } from 'theme/theme';

interface CollapsibleSectionProps {
  icon: React.ReactNode;
  title: string;
  isCollapsed: boolean;
  onToggle: () => void;
  accentColor: string;
  backgroundColor: string;
  preview?: React.ReactNode;
  controls?: React.ReactNode;
  /**
   * Render `controls` on their own full-width row beneath the title instead of
   * inline next to it. Prevents wide controls (e.g. a "Suggest Actions" link)
   * from overlapping the title in narrow containers like the action sidebar.
   */
  controlsBelow?: boolean;
  children: React.ReactNode;
  /** When provided, shows an X button that calls this handler to dismiss/hide the card. */
  onDismiss?: () => void;
  /** Tooltip text for the dismiss button. */
  dismissTitle?: string;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  icon,
  title,
  isCollapsed,
  onToggle,
  accentColor,
  backgroundColor,
  preview,
  controls,
  controlsBelow = false,
  children,
  onDismiss,
  dismissTitle,
}) => {
  return (
    <div
      style={{
        borderRadius: theme.borderRadius.lg,
        marginBottom: theme.spacing.md,
        border: `1px solid ${theme.colors.border.light}`,
        borderLeft: `4px solid ${accentColor}`,
        backgroundColor,
        overflow: 'hidden',
      }}
    >
      <div
        onClick={onToggle}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: `${theme.spacing.md} ${theme.spacing.lg}`,
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: theme.spacing.sm,
            flex: 1,
            minWidth: 0,
            // Clip title/preview at the header's left region so an over-long title
            // can never spill into (and overlap) the controls on the right, even
            // if a future caller passes a long title.
            overflow: 'hidden',
          }}
        >
          <span style={{ color: accentColor, display: 'flex', alignItems: 'center', flexShrink: 0 }}>{icon}</span>
          <strong
            style={{
              color: accentColor,
              fontSize: theme.typography.fontSize.base,
              fontWeight: theme.typography.fontWeight.semibold,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              // With a preview, keep the title full and let the preview absorb the
              // shrinking; with no preview, let the title itself truncate so it
              // never overflows into the controls (e.g. summary dropdown + spinner).
              // Either way the parent's overflow:hidden is the final safety net.
              flexShrink: isCollapsed && preview ? 0 : 1,
            }}
          >
            {title}
          </strong>
          {isCollapsed && preview && (
            <span
              style={{
                fontSize: theme.typography.fontSize.sm,
                color: theme.colors.text.secondary,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                marginLeft: theme.spacing.sm,
                minWidth: 0,
              }}
            >
              {preview}
            </span>
          )}
        </div>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm, flexShrink: 0 }}
          onClick={event => event.stopPropagation()}
        >
          {!controlsBelow && controls}
          <button
            onClick={event => {
              event.stopPropagation();
              onToggle();
            }}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: theme.colors.text.secondary,
              display: 'flex',
              alignItems: 'center',
              padding: theme.spacing.xs,
            }}
          >
            {isCollapsed ? <FiChevronDown size={18} /> : <FiChevronUp size={18} />}
          </button>
          {onDismiss && (
            <button
              onClick={event => {
                event.stopPropagation();
                onDismiss();
              }}
              title={dismissTitle}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: theme.colors.text.secondary,
                display: 'flex',
                alignItems: 'center',
                padding: theme.spacing.xs,
                borderRadius: theme.borderRadius.sm,
              }}
            >
              <FiX size={16} />
            </button>
          )}
        </div>
      </div>

      {controlsBelow && controls && !isCollapsed && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            padding: `0 ${theme.spacing.lg} ${theme.spacing.sm}`,
          }}
        >
          {controls}
        </div>
      )}

      {!isCollapsed && <div style={{ padding: `0 ${theme.spacing.lg} ${theme.spacing.lg}` }}>{children}</div>}
    </div>
  );
};
