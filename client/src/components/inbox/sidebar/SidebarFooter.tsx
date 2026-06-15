import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiChevronUp } from 'react-icons/fi';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { COLOR_TRANSPARENT } from 'constants/colors';

const logoutMenuItemStyle: React.CSSProperties = {
  width: '100%',
  textAlign: 'left',
  background: COLOR_TRANSPARENT,
  border: 'none',
  borderRadius: theme.borderRadius.sm,
  cursor: 'pointer',
  fontSize: theme.typography.fontSize.sm,
  fontWeight: theme.typography.fontWeight.medium,
  color: theme.colors.text.primary,
  padding: `${theme.spacing.sm} ${theme.spacing.md}`,
  whiteSpace: 'nowrap',
};

interface SidebarFooterProps {
  userEmail?: string;
  onLogout: () => void;
  isCollapsed?: boolean;
}

/** Initial shown in the collapsed-sidebar avatar button. */
const avatarInitial = (email?: string): string => (email ? email.trim()[0]?.toUpperCase() || '?' : '?');

/**
 * Sidebar footer account control. The logout action is intentionally not shown
 * at all times — clicking the user email (expanded) or the avatar (collapsed)
 * opens a small popover that contains Log out. Click-outside closes it.
 */
export const SidebarFooter: React.FC<SidebarFooterProps> = ({ userEmail, onLogout, isCollapsed = false }) => {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isLogoutHovered, setIsLogoutHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) {
      return undefined;
    }
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  const handleLogout = () => {
    setMenuOpen(false);
    captureEvent(ANALYTICS_EVENTS.SIDEBAR_LOGOUT_CLICKED);
    onLogout();
  };

  return (
    <>
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          borderTop: `1px solid ${theme.colors.border.light}`,
          paddingTop: theme.spacing.sm,
          display: 'flex',
          justifyContent: isCollapsed ? 'center' : 'flex-start',
        }}
      >
        <button
          onClick={() => setMenuOpen(prev => !prev)}
          title={isCollapsed ? userEmail : t('auth.accountMenu')}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={t('auth.accountMenu')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: theme.spacing.sm,
            width: isCollapsed ? 'auto' : '100%',
            padding: isCollapsed ? theme.spacing.xs : `${theme.spacing.xs} ${theme.spacing.sm}`,
            background: menuOpen || isHovered ? theme.colors.background.default : COLOR_TRANSPARENT,
            border: 'none',
            borderRadius: theme.borderRadius.md,
            cursor: 'pointer',
            color: theme.colors.text.secondary,
            transition: theme.transitions.fast,
          }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <span
            aria-hidden="true"
            style={{
              flexShrink: 0,
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              backgroundColor: theme.colors.primary.subtle,
              color: theme.colors.primary.main,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: theme.typography.fontSize.xs,
              fontWeight: theme.typography.fontWeight.semibold,
            }}
          >
            {avatarInitial(userEmail)}
          </span>
          {!isCollapsed && (
            <span
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: theme.typography.fontSize.sm,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                textAlign: 'left',
              }}
            >
              {userEmail}
            </span>
          )}
          {!isCollapsed && <FiChevronUp size={14} aria-hidden="true" style={{ flexShrink: 0 }} />}
        </button>
        {menuOpen && (
          <div
            role="menu"
            style={{
              position: 'absolute',
              bottom: 'calc(100% + 4px)',
              left: 0,
              right: isCollapsed ? 'auto' : 0,
              minWidth: '140px',
              backgroundColor: theme.colors.background.paper,
              border: `1px solid ${theme.colors.border.light}`,
              borderRadius: theme.borderRadius.md,
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
              padding: theme.spacing.xs,
              zIndex: 30,
            }}
          >
            <button
              role="menuitem"
              onClick={handleLogout}
              style={{
                ...logoutMenuItemStyle,
                backgroundColor: isLogoutHovered ? theme.colors.background.default : COLOR_TRANSPARENT,
              }}
              onMouseEnter={() => setIsLogoutHovered(true)}
              onMouseLeave={() => setIsLogoutHovered(false)}
            >
              {t('auth.logout')}
            </button>
          </div>
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
