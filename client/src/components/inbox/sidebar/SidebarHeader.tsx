import React from 'react';
import { useTranslation } from 'react-i18next';
import { FiChevronsLeft, FiChevronsRight } from 'react-icons/fi';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { COLOR_TRANSPARENT } from 'constants/colors';

interface SidebarHeaderProps {
  isCollapsed?: boolean;
  /** Whether the collapse/expand toggle should be shown (split view active or Settings page). */
  canToggleCollapse?: boolean;
  onToggleCollapse?: () => void;
}

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
}) => {
  const { t } = useTranslation();

  const showToggle = canToggleCollapse && !!onToggleCollapse;

  const handleToggle = () => {
    captureEvent(isCollapsed ? ANALYTICS_EVENTS.SIDEBAR_EXPAND_CLICKED : ANALYTICS_EVENTS.SIDEBAR_COLLAPSE_CLICKED);
    onToggleCollapse?.();
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
      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm, minWidth: 0 }}>
        <img
          src="/favicon.svg"
          alt="BearlyMail Icon"
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
      </div>
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
