import React, { useState } from 'react';
import { theme } from 'theme/theme';

import { COLOR_TRANSPARENT, COLOR_WHITE } from 'constants/colors';
import { useExpandWhenLinked } from 'hooks/useOpenForLinkedSection';

interface CollapsibleSettingsSectionProps {
  /** DOM id that `/settings#<anchorId>` links (and the Guide Our AI sub-nav) target. */
  anchorId: string;
  title: string;
  /** Shown as a badge beside the title; leave undefined while the items are still loading. */
  itemCount?: number;
  /** Controls beside the toggle, such as "Add rule". Kept outside the toggle button so each stays its own tab stop. */
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}

const badgeStyle: React.CSSProperties = {
  backgroundColor: theme.colors.greyscale[300],
  color: theme.colors.text.secondary,
  padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
  borderRadius: theme.borderRadius.full,
  fontSize: theme.typography.fontSize.sm,
  fontWeight: theme.typography.fontWeight.medium,
};

const toggleButtonStyle: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing.sm,
  padding: 0,
  fontSize: theme.typography.fontSize.lg,
  fontWeight: theme.typography.fontWeight.semibold,
  color: theme.colors.text.primary,
  backgroundColor: COLOR_TRANSPARENT,
  border: 'none',
  textAlign: 'left',
  cursor: 'pointer',
};

/**
 * A Settings section that starts collapsed: a ▶ toggle with the item count,
 * optional header controls, and the body. It opens itself when a
 * `/settings#<anchorId>` link points at it. The body stays mounted while
 * collapsed so drafts typed into it survive closing it.
 */
export const CollapsibleSettingsSection: React.FC<CollapsibleSettingsSectionProps> = ({
  anchorId,
  title,
  itemCount,
  headerAction,
  children,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const sectionRef = useExpandWhenLinked<HTMLElement>(setIsExpanded);

  const headingId = `${anchorId}-heading`;
  const panelId = `${anchorId}-panel`;

  return (
    <section
      id={anchorId}
      ref={sectionRef}
      aria-labelledby={headingId}
      style={{
        marginBottom: theme.spacing.lg,
        border: `1px solid ${theme.colors.border.light}`,
        borderRadius: theme.borderRadius.md,
        backgroundColor: theme.colors.background.paper,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: theme.spacing.sm,
          padding: `${theme.spacing.sm} ${theme.spacing.md}`,
          borderBottom: isExpanded ? `1px solid ${theme.colors.border.light}` : 'none',
        }}
      >
        <h3 id={headingId} style={{ margin: 0, flex: '1 1 auto', minWidth: 0 }}>
          <button
            type="button"
            aria-expanded={isExpanded}
            aria-controls={panelId}
            onClick={() => setIsExpanded(previous => !previous)}
            style={toggleButtonStyle}
          >
            <span
              aria-hidden="true"
              style={{
                transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: theme.transitions.fast,
                fontSize: theme.typography.fontSize.base,
                color: theme.colors.text.secondary,
              }}
            >
              ▶
            </span>
            <span>{title}</span>
            {/* The space keeps screen readers from running the title into the count; flex layout ignores it. */}
            {itemCount !== undefined && (
              <>
                {' '}
                <span style={badgeStyle}>{itemCount}</span>
              </>
            )}
          </button>
        </h3>
        {headerAction}
      </div>
      <div id={panelId} hidden={!isExpanded} style={{ padding: theme.spacing.md }}>
        {children}
      </div>
    </section>
  );
};

interface SectionHeaderActionButtonProps {
  label: string;
  onClick: () => void;
}

/** The compact primary button ("Add rule") that sits in a collapsible section's header. */
export const SectionHeaderActionButton: React.FC<SectionHeaderActionButtonProps> = ({ label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      padding: `${theme.spacing.xs} ${theme.spacing.md}`,
      borderRadius: theme.borderRadius.sm,
      border: 'none',
      background: theme.colors.primary.main,
      color: COLOR_WHITE,
      cursor: 'pointer',
      fontSize: theme.typography.fontSize.sm,
    }}
  >
    {label}
  </button>
);
