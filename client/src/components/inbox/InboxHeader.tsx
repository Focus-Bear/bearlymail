import React, { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { FiFilter } from 'react-icons/fi';
import { theme } from 'theme/theme';
import { InboxMode } from 'types/email';

import { InboxHeaderActions,InboxHeaderTabs } from 'components/inbox/header';
import { COLOR_NAMED_WHITE, COLOR_TRANSPARENT } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';

const HAMBURGER_ICON = '\u2630'; // ☰

interface TabCounts {
  triage: number;
  action: number;
  followUp: number;
}

interface InboxHeaderProps {
  mode: InboxMode;
  setMode: (mode: InboxMode) => void;
  loadingModeSwitch: boolean;
  hasRunAnalysis: boolean | null;
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
}

export const InboxHeader: React.FC<InboxHeaderProps> = ({
  mode,
  setMode,
  loadingModeSwitch,
  hasRunAnalysis,
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
}) => {
  const { t } = useTranslation();
  const { isMobile, isTablet } = useResponsiveBreakpoints();
  const isNarrow = isMobile || isTablet;

  return (
    <header
      style={{ padding: isNarrow ? `${theme.spacing.sm} ${theme.spacing.xs}` : `${theme.spacing.sm} ${theme.spacing.lg}`, backgroundColor: theme.colors.background.paper, borderBottom: `1px solid ${theme.colors.border.light}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', }}
    >
      <div
        style={{ display: 'flex', gap: theme.spacing.sm, alignItems: 'center', }}
      >
        {/* Hamburger menu button for mobile and tablet */}
        {isNarrow && (
          <button
            onClick={onToggleMobileMenu}
            style={{ background: STRING_NONE, border: STRING_NONE, cursor: 'pointer', padding: theme.spacing.xs, display: 'flex', alignItems: 'center', fontSize: '24px', color: theme.colors.text.primary, }}
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
        />

        {/* Filter toggle button - inline with tabs */}
        <button
          onClick={onToggleFilterBar}
          data-testid="filter-toggle-button"
          title={t('inbox.filters.toggle')}
          style={{ padding: `${theme.spacing.xs} ${theme.spacing.sm}`, fontSize: theme.typography.fontSize.base, borderRadius: theme.borderRadius.md, border: hasActiveFilters ? 'none' : `1px solid ${theme.colors.border.medium}`, backgroundColor: (() => { if (hasActiveFilters) return theme.colors.primary.main; if (isFilterBarVisible) return theme.colors.background.subtle; return theme.colors.background.paper; })(), color: hasActiveFilters ? 'white' : theme.colors.text.primary, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: theme.spacing.xs, transition: theme.transitions.fast, flexShrink: 0, }}
          onMouseEnter={(e) => {
            if (!hasActiveFilters) {
              e.currentTarget.style.backgroundColor = theme.colors.background.subtle;
            }
          }}
          onMouseLeave={(e) => {
            if (!hasActiveFilters) {
              e.currentTarget.style.backgroundColor = isFilterBarVisible
                ? theme.colors.background.subtle
                : theme.colors.background.paper;
            }
          }}
        >
          <FiFilter size={14} />
          {hasActiveFilters && (
            <span
              style={{ backgroundColor: COLOR_NAMED_WHITE, color: theme.colors.primary.main, borderRadius: theme.borderRadius.full, padding: `0 ${theme.spacing.xs}`, fontSize: theme.typography.fontSize.xs, fontWeight: theme.typography.fontWeight.bold, minWidth: '16px', textAlign: 'center', }}
            >
              {activeFilterCount}
            </span>
          )}
        </button>

        {/* Clear filters link - shown when active */}
        {hasActiveFilters && (
          <button
            onClick={onClearFilters}
            style={{ padding: `${theme.spacing.xs} ${theme.spacing.xs}`, fontSize: theme.typography.fontSize.sm, border: STRING_NONE, backgroundColor: COLOR_TRANSPARENT, color: theme.colors.primary.main, cursor: 'pointer', textDecoration: 'underline', flexShrink: 0, }}
          >
            {t('inbox.filters.clear')}
          </button>
        )}
      </div>

      <InboxHeaderActions
        mode={mode}
        hasRunAnalysis={hasRunAnalysis}
        isAdmin={isAdmin}
        debugViewOpen={debugViewOpen}
        onToggleDebug={onToggleDebug}
        onViewBlockedEmails={onViewBlockedEmails}
        onViewAutoRespondedEmails={onViewAutoRespondedEmails}
      />
    </header>
  );
};

