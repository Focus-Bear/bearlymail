import React, { useId, useState } from 'react';
import { theme } from 'theme/theme';

import { COLOR_TRANSPARENT, COLOR_WHITE } from 'constants/colors';
import { useExpandWhenLinked } from 'hooks/useOpenForLinkedSection';

type SectionHeadingTag = 'h3' | 'h4';

interface CollapsibleSettingsSectionProps {
  /** DOM id that `/settings#<anchorId>` links (and the Guide Our AI sub-nav) target. Sections nobody links to can omit it. */
  anchorId?: string;
  title: string;
  /** Shown as a badge beside the title; leave undefined while the items are still loading. */
  itemCount?: number;
  /** Extra non-interactive badges read as part of the toggle's name, such as "3 pending". */
  titleBadges?: React.ReactNode;
  /** Interactive controls that belong next to the title, such as the ? help icon. Kept outside the toggle button so each is its own tab stop. */
  titleAdornment?: React.ReactNode;
  /** Controls at the far end of the header, such as "Add rule" or a ⋮ menu. Kept outside the toggle button so each is its own tab stop. */
  headerAction?: React.ReactNode;
  /** Sections nested under another heading (e.g. inside "Context About Me") use h4 to keep the outline correct. */
  headingTag?: SectionHeadingTag;
  isInitiallyExpanded?: boolean;
  /** For bodies that are heavy to render and hold no local drafts: render them only while open. */
  shouldUnmountBodyWhenCollapsed?: boolean;
  /** Turn off for bodies that lay out their own edge-to-edge strips, such as a tab bar. */
  hasBodyPadding?: boolean;
  children: React.ReactNode;
}

const badgeStyle: React.CSSProperties = {
  backgroundColor: theme.colors.greyscale[300],
  color: theme.colors.text.secondary,
  padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
  borderRadius: theme.borderRadius.full,
  fontSize: theme.typography.fontSize.sm,
  fontWeight: theme.typography.fontWeight.medium,
  flexShrink: 0,
  whiteSpace: 'nowrap',
};

const toggleButtonStyle: React.CSSProperties = {
  minWidth: 0,
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
 * A Settings accordion (collapsed unless `isInitiallyExpanded`): a ▶ toggle
 * button inside a heading, with the item count, optional header controls, and
 * the body. It opens itself when a `/settings#<anchorId>` link points at it.
 * By default the body stays mounted while collapsed so drafts typed into it
 * survive closing it.
 */
export const CollapsibleSettingsSection: React.FC<CollapsibleSettingsSectionProps> = ({
  anchorId,
  title,
  itemCount,
  titleBadges,
  titleAdornment,
  headerAction,
  headingTag: HeadingTag = 'h3',
  isInitiallyExpanded = false,
  shouldUnmountBodyWhenCollapsed = false,
  hasBodyPadding = true,
  children,
}) => {
  const [isExpanded, setIsExpanded] = useState(isInitiallyExpanded);
  const sectionRef = useExpandWhenLinked<HTMLElement>(setIsExpanded);
  const generatedId = useId();
  const idPrefix = anchorId ?? generatedId;
  const toggle = () => setIsExpanded(previous => !previous);

  const headingId = `${idPrefix}-heading`;
  const panelId = `${idPrefix}-panel`;
  const isBodyRendered = isExpanded || !shouldUnmountBodyWhenCollapsed;

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
        {/* Title and help icon stay on one line (the title text wraps instead); header actions wrap below when narrow. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm, flex: '1 1 auto', minWidth: 0 }}>
          <HeadingTag id={headingId} style={{ margin: 0, minWidth: 0 }}>
            <button
              type="button"
              aria-expanded={isExpanded}
              aria-controls={panelId}
              onClick={toggle}
              style={toggleButtonStyle}
            >
              <span
                aria-hidden="true"
                style={{
                  flexShrink: 0,
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
              {titleBadges && (
                <>
                  {' '}
                  {titleBadges}
                </>
              )}
            </button>
          </HeadingTag>
          {titleAdornment}
          {/* Mouse-only: keeps the rest of the header row clickable, as it was before the toggle became a button.
              Keyboard and screen-reader users get the button itself, so this stays out of the accessibility tree. */}
          <div aria-hidden="true" onClick={toggle} style={{ flex: '1 1 0', alignSelf: 'stretch', cursor: 'pointer' }} />
        </div>
        {headerAction && <div style={{ marginLeft: 'auto' }}>{headerAction}</div>}
      </div>
      <div id={panelId} hidden={!isExpanded} style={hasBodyPadding ? { padding: theme.spacing.md } : undefined}>
        {isBodyRendered && children}
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
