import React from 'react';
import { FiChevronDown, FiChevronUp } from 'react-icons/fi';
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
  children: React.ReactNode;
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
  children,
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
          }}
        >
          <span style={{ color: accentColor, display: 'flex', alignItems: 'center', flexShrink: 0 }}>{icon}</span>
          <strong
            style={{
              color: accentColor,
              fontSize: theme.typography.fontSize.base,
              fontWeight: theme.typography.fontWeight.semibold,
              flexShrink: 0,
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
          {controls}
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
        </div>
      </div>

      {!isCollapsed && <div style={{ padding: `0 ${theme.spacing.lg} ${theme.spacing.lg}` }}>{children}</div>}
    </div>
  );
};
