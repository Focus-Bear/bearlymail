import React from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { theme } from 'theme/theme';

import { COLOR_TRANSPARENT } from 'constants/colors';
import { EMOJI_BACK } from 'constants/emojis';
import { NAVIGATION_SOURCE_SEARCH, ROUTE_SEARCH } from 'constants/strings';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';

interface EmailDetailNavigationState {
  fromMode?: string;
  fromBasePath?: string;
  /** Set to 'search' when the email was opened from the search results list. */
  from?: string;
  /** URL query string (e.g. '?q=invoice') to restore when returning to search. */
  search?: string;
}

export const EmailDetailSidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { isMobile } = useResponsiveBreakpoints();
  const state = location.state as EmailDetailNavigationState | null;
  const isFromSearch = state?.from === NAVIGATION_SOURCE_SEARCH;
  const fromMode = state?.fromMode ?? sessionStorage.getItem('bearlymail_lastInboxMode') ?? undefined;
  const fromBasePath = state?.fromBasePath ?? sessionStorage.getItem('bearlymail_lastBasePath') ?? '/inbox';
  const inboxPath = fromMode ? `${fromBasePath}/${fromMode}` : fromBasePath;
  const backPath = isFromSearch ? `${ROUTE_SEARCH}${state?.search ?? ''}` : inboxPath;
  const backLabel = isFromSearch ? t('search.backToSearchResults') : t('common.backToInbox');

  // On mobile, render as floating overlay button
  if (isMobile) {
    return (
      <button
        onClick={() => navigate(backPath)}
        style={{
          position: 'fixed',
          top: theme.spacing.md,
          left: theme.spacing.md,
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          border: `1px solid ${theme.colors.border.medium}`,
          backgroundColor: theme.colors.background.paper,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.2rem',
          transition: theme.transitions.fast,
          boxShadow: theme.shadows.md,
          zIndex: 100,
        }}
        onMouseEnter={event => (event.currentTarget.style.backgroundColor = theme.colors.background.default)}
        onMouseLeave={event => (event.currentTarget.style.backgroundColor = theme.colors.background.paper)}
        title={backLabel}
      >
        {EMOJI_BACK}
      </button>
    );
  }

  // On desktop, render as fixed sidebar
  return (
    <div
      style={{
        width: '80px',
        backgroundColor: theme.colors.background.paper,
        borderRight: `1px solid ${theme.colors.border.light}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: theme.spacing.xl,
      }}
    >
      <button
        onClick={() => navigate(backPath)}
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          border: `1px solid ${theme.colors.border.medium}`,
          backgroundColor: COLOR_TRANSPARENT,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.2rem',
          transition: theme.transitions.fast,
        }}
        onMouseEnter={event => (event.currentTarget.style.backgroundColor = theme.colors.background.default)}
        onMouseLeave={event => (event.currentTarget.style.backgroundColor = COLOR_TRANSPARENT)}
        title={backLabel}
      >
        {EMOJI_BACK}
      </button>
    </div>
  );
};
