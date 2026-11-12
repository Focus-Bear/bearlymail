import React, { RefObject, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiFilter, FiX } from 'react-icons/fi';
import { theme } from 'theme/theme';
import { InboxMode } from 'types/email';

import { InboxHeaderActions, InboxHeaderTabs } from 'components/inbox/header';
import { COLOR_NAMED_WHITE, COLOR_TRANSPARENT } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';
import { ActionMoveFeedback } from 'hooks/useActionMoveFeedback';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';

const HAMBURGER_ICON = '\u2630'; // ☰

interface FilterToggleButtonProps {
  isFilterBarVisible: boolean;
  hasActiveFilters: boolean;
  activeFilterCount: number;
  onToggle: () => void;
}

const FilterToggleButton: React.FC<FilterToggleButtonProps> = ({
  isFilterBarVisible,
  hasActiveFilters,
  activeFilterCount,
  onToggle,
}) => {
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);
  const getBackgroundColor = () => {
    if (hasActiveFilters) {
      return theme.colors.primary.main;
    }
    if (isFilterBarVisible || isHovered) {
      return theme.colors.background.subtle;
    }
    return theme.colors.background.paper;
  };
  return (
    <button
      onClick={onToggle}
      data-testid="filter-toggle-button"
      title={t('inbox.filters.toggle')}
      style={{
        padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
        fontSize: theme.typography.fontSize.base,
        borderRadius: theme.borderRadius.md,
        border: hasActiveFilters ? 'none' : `1px solid ${theme.colors.border.medium}`,
        backgroundColor: getBackgroundColor(),
        color: hasActiveFilters ? 'white' : theme.colors.text.primary,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: theme.spacing.xs,
        transition: theme.transitions.fast,
        flexShrink: 0,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <FiFilter size={14} />
      {hasActiveFilters && (
        <span
          style={{
            backgroundColor: COLOR_NAMED_WHITE,
            color: theme.colors.primary.main,
            borderRadius: theme.borderRadius.full,
            padding: `0 ${theme.spacing.xs}`,
            fontSize: theme.typography.fontSize.sm,
            fontWeight: theme.typography.fontWeight.bold,
            minWidth: '16px',
            textAlign: 'center',
          }}
        >
          {activeFilterCount}
        </span>
      )}
    </button>
  );
};

interface ClearFiltersButtonProps {
  onClear: () => void;
  label: string;
  /** Phone/tablet width: an × icon, since the text label pushed the header off screen (#442). */
  compact: boolean;
}

const ClearFiltersButton: React.FC<ClearFiltersButtonProps> = ({ onClear, label, compact }) => (
  <button
    onClick={onClear}
    aria-label={label}
    title={label}
    data-testid="clear-filters-button"
    style={{
      padding: theme.spacing.xs,
      fontSize: theme.typography.fontSize.lg,
      border: STRING_NONE,
      backgroundColor: COLOR_TRANSPARENT,
      color: theme.colors.primary.main,
      cursor: 'pointer',
      textDecoration: compact ? STRING_NONE : 'underline',
      display: 'flex',
      alignItems: 'center',
      flexShrink: 0,
    }}
  >
    {compact ? <FiX size={18} aria-hidden /> : label}
  </button>
);

interface TabCounts {
  triage: number;
  action: number;
  followUp: number;
}

interface InboxHeaderProps {
  mode: InboxMode;
  setMode: (mode: InboxMode) => void;
  loadingModeSwitch: boolean;
  triageTabRef: RefObject<HTMLButtonElement | null>;
  actionTabRef: RefObject<HTMLButtonElement | null>;
  followUpTabRef: RefObject<HTMLButtonElement | null>;
  tabCounts?: TabCounts | null;
  onToggleMobileMenu?: () => void;
  // Filter props
  isFilterBarVisible: boolean;
  hasActiveFilters: boolean;
  activeFilterCount: number;
  onToggleFilterBar: () => void;
  onClearFilters: () => void;
  // Debug toggle (admin only)
  isAdmin?: boolean;
  debugViewOpen?: boolean;
  onToggleDebug?: () => void;
  onViewBlockedEmails?: () => void;
  onViewAutoRespondedEmails?: () => void;
  /** Signals that a prioritised email just moved to the Action tab. */
  actionMoveFeedback?: Pick<ActionMoveFeedback, 'tabEmphasis' | 'onTabEmphasisEnd' | 'movedCount'>;
}

export const InboxHeader: React.FC<InboxHeaderProps> = ({
  mode,
  setMode,
  loadingModeSwitch,
  triageTabRef,
  actionTabRef,
  followUpTabRef,
  tabCounts,
  onToggleMobileMenu,
  isFilterBarVisible,
  hasActiveFilters,
  activeFilterCount,
  onToggleFilterBar,
  onClearFilters,
  isAdmin,
  debugViewOpen,
  onToggleDebug,
  onViewBlockedEmails,
  onViewAutoRespondedEmails,
  actionMoveFeedback,
}) => {
  const { t } = useTranslation();
  const { isMobile, isTablet } = useResponsiveBreakpoints();
  const isNarrow = isMobile || isTablet;

  return (
    <header
      style={{
        padding: isNarrow ? `${theme.spacing.sm} ${theme.spacing.xs}` : `${theme.spacing.sm} ${theme.spacing.lg}`,
        backgroundColor: theme.colors.background.paper,
        borderBottom: `1px solid ${theme.colors.border.light}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        // Narrow screens: the actions drop to a second row instead of overflowing (#442).
        flexWrap: 'wrap',
        rowGap: theme.spacing.xs,
      }}
    >
      <div style={{ display: 'flex', gap: theme.spacing.sm, alignItems: 'center', minWidth: 0 }}>
        {/* Hamburger menu button for mobile and tablet */}
        {isNarrow && (
          <button
            onClick={onToggleMobileMenu}
            style={{
              background: STRING_NONE,
              border: STRING_NONE,
              cursor: 'pointer',
              padding: theme.spacing.xs,
              display: 'flex',
              alignItems: 'center',
              fontSize: '24px',
              color: theme.colors.text.primary,
            }}
            aria-label="Toggle navigation menu"
          >
            {HAMBURGER_ICON}
          </button>
        )}

        <InboxHeaderTabs
          mode={mode}
          setMode={setMode}
          loadingModeSwitch={loadingModeSwitch}
          triageTabRef={triageTabRef}
          actionTabRef={actionTabRef}
          followUpTabRef={followUpTabRef}
          tabCounts={tabCounts}
          actionTabEmphasis={actionMoveFeedback?.tabEmphasis}
          onActionTabEmphasisEnd={actionMoveFeedback?.onTabEmphasisEnd}
          actionMovedCount={actionMoveFeedback?.movedCount}
        />

        <FilterToggleButton
          isFilterBarVisible={isFilterBarVisible}
          hasActiveFilters={hasActiveFilters}
          activeFilterCount={activeFilterCount}
          onToggle={onToggleFilterBar}
        />

        {hasActiveFilters && (
          <ClearFiltersButton onClear={onClearFilters} label={t('inbox.filters.clear')} compact={isNarrow} />
        )}
      </div>

      <InboxHeaderActions
        mode={mode}
        isAdmin={isAdmin}
        debugViewOpen={debugViewOpen}
        onToggleDebug={onToggleDebug}
        onViewBlockedEmails={onViewBlockedEmails}
        onViewAutoRespondedEmails={onViewAutoRespondedEmails}
      />
    </header>
  );
};
