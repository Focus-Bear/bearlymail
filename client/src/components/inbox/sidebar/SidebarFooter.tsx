import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { COLOR_TRANSPARENT } from 'constants/colors';

const sidebarBtnStyle: React.CSSProperties = {
  padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
  backgroundColor: COLOR_TRANSPARENT,
  color: theme.colors.text.secondary,
  border: `1px solid ${theme.colors.border.medium}`,
  borderRadius: theme.borderRadius.md,
  cursor: 'pointer',
  fontSize: theme.typography.fontSize.xs,
  fontWeight: theme.typography.fontWeight.medium,
  transition: theme.transitions.fast,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  whiteSpace: 'nowrap',
};

const onSidebarBtnMouseEnter = (event: React.MouseEvent<HTMLButtonElement>) => {
  event.currentTarget.style.borderColor = theme.colors.text.primary;
  event.currentTarget.style.color = theme.colors.text.primary;
};

const onSidebarBtnMouseLeave = (event: React.MouseEvent<HTMLButtonElement>) => {
  event.currentTarget.style.borderColor = theme.colors.border.medium;
  event.currentTarget.style.color = theme.colors.text.secondary;
};

interface SidebarFooterProps {
  userEmail?: string;
  onLogout: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const SidebarFooter: React.FC<SidebarFooterProps> = ({
  userEmail,
  onLogout,
  isCollapsed = false,
  onToggleCollapse,
}) => {
  const { t } = useTranslation();

  return (
    <>
      <div
        style={{
          borderTop: `1px solid ${theme.colors.border.light}`,
          paddingTop: theme.spacing.sm,
          display: isCollapsed ? 'flex' : 'flex',
          flexDirection: isCollapsed ? 'column' : 'row',
          alignItems: 'center',
          justifyContent: isCollapsed ? 'center' : 'space-between',
          gap: theme.spacing.sm,
        }}
      >
        {!isCollapsed && (
          <div
            style={{
              fontSize: theme.typography.fontSize.sm,
              color: theme.colors.text.secondary,
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {userEmail}
          </div>
        )}
        {isCollapsed && onToggleCollapse ? (
          /* eslint-disable i18next/no-literal-string */
          <button
            onClick={() => {
              captureEvent(ANALYTICS_EVENTS.SIDEBAR_EXPAND_CLICKED);
              onToggleCollapse();
            }}
            title={t('sidebar.expand')}
            style={sidebarBtnStyle}
            onMouseEnter={onSidebarBtnMouseEnter}
            onMouseLeave={onSidebarBtnMouseLeave}
          >
            ☰
          </button>
        ) : (
          /* eslint-enable i18next/no-literal-string */
          <button
            onClick={() => {
              captureEvent(ANALYTICS_EVENTS.SIDEBAR_LOGOUT_CLICKED);
              onLogout();
            }}
            title={isCollapsed ? t('auth.logout') : undefined}
            style={sidebarBtnStyle}
            onMouseEnter={onSidebarBtnMouseEnter}
            onMouseLeave={onSidebarBtnMouseLeave}
          >
            {t('auth.logout')}
          </button>
        )}
      </div>
      {!isCollapsed && (
        <footer style={{ marginTop: '2px', textAlign: 'left' }}>
          <a
            href="https://focusbear.io"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => captureEvent(ANALYTICS_EVENTS.SIDEBAR_FOCUSBEAR_LINK_CLICKED)}
            style={{
              color: theme.colors.text.tertiary,
              textDecoration: 'none',
              fontSize: '9px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px',
              opacity: 0.7,
            }}
          >
            {t('footer.madeBy')} {t('footer.focusBear')}
            <img
              src="https://focus-bear.github.io/assets/focus-blocked/images/FocusBearLogo.svg"
              alt={t('footer.focusBearLogo')}
              style={{ height: '12px', verticalAlign: 'middle' }}
            />
          </a>
        </footer>
      )}
    </>
  );
};
