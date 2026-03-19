import React from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { theme } from 'theme/theme';

import { COLOR_TRANSPARENT } from 'constants/colors';
import { EMOJI_BACK } from 'constants/emojis';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';

export const EmailDetailSidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { isMobile } = useResponsiveBreakpoints();
  const state = location.state as { fromMode?: string; fromBasePath?: string } | null;
  const fromMode = state?.fromMode ?? sessionStorage.getItem('bearlymail_lastInboxMode') ?? undefined;
  const fromBasePath = state?.fromBasePath ?? sessionStorage.getItem('bearlymail_lastBasePath') ?? '/inbox';
  const backPath = fromMode ? `${fromBasePath}/${fromMode}` : fromBasePath;

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
        title={t('emailDetail.backToInbox')}
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
        title={t('emailDetail.backToInbox')}
      >
        {EMOJI_BACK}
      </button>
    </div>
  );
};
