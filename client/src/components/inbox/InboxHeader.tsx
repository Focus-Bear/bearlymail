import React, { RefObject } from 'react';
import { theme } from 'theme/theme';
import { InboxMode } from 'types/email';
import { InboxHeaderTabs, InboxHeaderActions } from 'components/inbox/header';
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
}) => {
  const { isMobile } = useResponsiveBreakpoints();

  return (
    <header
      style={{
        padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
        backgroundColor: theme.colors.background.paper,
        borderBottom: `1px solid ${theme.colors.border.light}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: theme.spacing.md,
          alignItems: 'center',
        }}
      >
        {/* Hamburger menu button for mobile */}
        {isMobile && (
          <button
            onClick={onToggleMobileMenu}
            style={{
              background: 'none',
              border: 'none',
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
        />
      </div>

      <InboxHeaderActions
        mode={mode}
        hasRunAnalysis={hasRunAnalysis}
      />
    </header>
  );
};

