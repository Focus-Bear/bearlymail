import React from 'react';
import { useTranslation } from 'react-i18next';
import { FiChevronsLeft, FiChevronsRight } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { COLOR_TRANSPARENT } from 'constants/colors';
import { ROUTE_INBOX, STRING_NONE } from 'constants/strings';

interface SidebarHeaderProps {
  isCollapsed?: boolean;
  /** Whether the collapse/expand toggle should be shown (split view active or Settings page). */
  canToggleCollapse?: boolean;
  onToggleCollapse?: () => void;
  /** Called after the logo navigates to the inbox, e.g. so the mobile menu can close. */
  onLogoClick?: () => void;
}

const logoLinkStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing.sm,
  minWidth: 0,
  textDecoration: STRING_NONE,
};

const toggleBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: theme.spacing.xs,
  backgroundColor: COLOR_TRANSPARENT,
  color: theme.colors.text.secondary,
  border: 'none',
  borderRadius: theme.borderRadius.sm,
  cursor: 'pointer',
  transition: theme.transitions.fast,
};

const onToggleBtnMouseEnter = (event: React.MouseEvent<HTMLButtonElement>) => {
  event.currentTarget.style.color = theme.colors.text.primary;
};

const onToggleBtnMouseLeave = (event: React.MouseEvent<HTMLButtonElement>) => {
  event.currentTarget.style.color = theme.colors.text.secondary;
};

export const SidebarHeader: React.FC<SidebarHeaderProps> = ({
  isCollapsed = false,
  canToggleCollapse = false,
  onToggleCollapse,
  onLogoClick,
}) => {
  const { t } = useTranslation();

  const showToggle = canToggleCollapse && !!onToggleCollapse;

  const handleToggle = () => {
    captureEvent(isCollapsed ? ANALYTICS_EVENTS.SIDEBAR_EXPAND_CLICKED : ANALYTICS_EVENTS.SIDEBAR_COLLAPSE_CLICKED);
    onToggleCollapse?.();
  };

  const handleLogoClick = () => {
    captureEvent(ANALYTICS_EVENTS.SIDEBAR_LOGO_CLICKED);
    onLogoClick?.();
  };

  return (
    <div
      style={{
        marginTop: theme.spacing.lg,
        marginBottom: theme.spacing.md,
        paddingLeft: isCollapsed ? theme.spacing.xs : 0,
        display: 'flex',
        flexDirection: isCollapsed ? 'column' : 'row',
        alignItems: 'center',
        justifyContent: isCollapsed ? 'center' : 'space-between',
        gap: theme.spacing.sm,
      }}
    >
      <Link
        to={ROUTE_INBOX}
        onClick={handleLogoClick}
        title={t('sidebar.goToInbox')}
        aria-label={t('sidebar.goToInbox')}
        style={logoLinkStyle}
      >
        <img
          src="/favicon.svg"
          alt=""
          style={{
            height: '28px',
            width: 'auto',
            objectFit: 'contain',
          }}
        />
        {!isCollapsed && (
          <h2
            style={{
              color: theme.colors.primary.main,
              fontSize: theme.typography.fontSize.xl,
              fontWeight: theme.typography.fontWeight.bold,
              letterSpacing: '-0.02em',
            }}
          >
            {t('common.appName')}
          </h2>
        )}
      </Link>
      {showToggle && (
        <button
          onClick={handleToggle}
          title={isCollapsed ? t('sidebar.expand') : t('sidebar.collapse')}
          aria-label={isCollapsed ? t('sidebar.expand') : t('sidebar.collapse')}
          style={toggleBtnStyle}
          onMouseEnter={onToggleBtnMouseEnter}
          onMouseLeave={onToggleBtnMouseLeave}
        >
          {isCollapsed ? <FiChevronsRight size={18} /> : <FiChevronsLeft size={18} />}
        </button>
      )}
    </div>
  );
};
