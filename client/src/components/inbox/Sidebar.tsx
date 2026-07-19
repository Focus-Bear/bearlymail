import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';

import { SettingsSubNavGroup as SettingsSubNavGroupComponent } from 'components/inbox/sidebar/SettingsSubNavGroup';
import { SettingsSubNavItem as SettingsSubNavItemComponent } from 'components/inbox/sidebar/SettingsSubNavItem';
import { SidebarFooter } from 'components/inbox/sidebar/SidebarFooter';
import { SidebarHeader } from 'components/inbox/sidebar/SidebarHeader';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { COLOR_NAMED_WHITE, COLOR_TRANSPARENT } from 'constants/colors';
import { MAX_BADGE_DISPLAY } from 'constants/numbers';
import {
  ROUTE_ADMIN,
  ROUTE_COMPOSE,
  ROUTE_CRM_CONTACT_GROUPS,
  ROUTE_CRM_CONTACTS,
  ROUTE_CRM_DEALS,
  ROUTE_INBOX,
  ROUTE_SEARCH,
  ROUTE_SETTINGS,
  ROUTE_STATS,
  STRING_NONE,
} from 'constants/strings';
import { User } from 'contexts/AuthContext';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';

import { getSettingsNavItems, makeScrollToSection, SettingsSubNavGroup, SettingsSubNavItem } from './sidebar.helpers';

interface SidebarItemProps {
  label: string;
  path: string;
  icon?: string;
  active?: boolean;
  isCollapsed?: boolean;
  onNavigationClick?: (path: string) => void;
  badge?: number;
  prominent?: boolean;
}

const SIDEBAR_ROUTE_EVENTS: Record<string, string> = {
  [ROUTE_INBOX]: ANALYTICS_EVENTS.SIDEBAR_INBOX_CLICKED,
  [ROUTE_COMPOSE]: ANALYTICS_EVENTS.SIDEBAR_COMPOSE_CLICKED,
  [ROUTE_SEARCH]: ANALYTICS_EVENTS.SIDEBAR_SEARCH_CLICKED,
  [ROUTE_CRM_CONTACTS]: ANALYTICS_EVENTS.SIDEBAR_CONTACTS_CLICKED,
  [ROUTE_CRM_DEALS]: ANALYTICS_EVENTS.SIDEBAR_DEALS_CLICKED,
  [ROUTE_STATS]: ANALYTICS_EVENTS.SIDEBAR_STATS_CLICKED,
  [ROUTE_SETTINGS]: ANALYTICS_EVENTS.SIDEBAR_SETTINGS_CLICKED,
  [ROUTE_ADMIN]: ANALYTICS_EVENTS.SIDEBAR_ADMIN_CLICKED,
};

interface SidebarBadgeProps {
  count: number;
  isCollapsed?: boolean;
}

const SidebarBadge: React.FC<SidebarBadgeProps> = ({ count, isCollapsed }) => (
  <span
    style={{
      backgroundColor: theme.colors.primary.main,
      color: COLOR_NAMED_WHITE,
      borderRadius: '10px',
      fontSize: '11px',
      fontWeight: theme.typography.fontWeight.semibold,
      minWidth: '18px',
      height: '18px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0 4px',
      marginLeft: isCollapsed ? 0 : 'auto',
    }}
  >
    {count > MAX_BADGE_DISPLAY ? `${MAX_BADGE_DISPLAY}+` : count}
  </span>
);

const SidebarItem: React.FC<SidebarItemProps> = ({
  label,
  path,
  icon,
  active,
  isCollapsed,
  onNavigationClick,
  badge,
  prominent,
}) => {
  const handleClick = () => {
    const eventName = SIDEBAR_ROUTE_EVENTS[path];
    if (eventName) {
      captureEvent(eventName);
    }
    if (onNavigationClick) {
      onNavigationClick(path);
    }
  };

  const restingBackground = prominent ? theme.colors.secondary.main : COLOR_TRANSPARENT;
  const restingColor = prominent ? COLOR_NAMED_WHITE : theme.colors.text.secondary;
  const hoverBackground = prominent ? theme.colors.secondary.dark : theme.colors.background.default;
  const hoverColor = prominent ? COLOR_NAMED_WHITE : theme.colors.text.primary;

  return (
    <Link
      to={path}
      onClick={handleClick}
      title={isCollapsed ? label : undefined}
      style={{
        width: '100%',
        padding: isCollapsed ? `${theme.spacing.sm} ${theme.spacing.xs}` : `${theme.spacing.sm} ${theme.spacing.md}`,
        marginBottom: theme.spacing.xs,
        backgroundColor: active ? theme.colors.primary.main : restingBackground,
        color: active ? 'white' : restingColor,
        borderRadius: theme.borderRadius.md,
        cursor: 'pointer',
        fontSize: theme.typography.fontSize.base,
        fontWeight:
          active || prominent ? theme.typography.fontWeight.semibold : theme.typography.fontWeight.medium,
        display: 'flex',
        alignItems: 'center',
        justifyContent: isCollapsed ? 'center' : 'flex-start',
        gap: theme.spacing.sm,
        transition: theme.transitions.fast,
        position: 'relative',
        textDecoration: STRING_NONE,
      }}
      onMouseEnter={event => {
        if (!active) {
          event.currentTarget.style.backgroundColor = hoverBackground;
          event.currentTarget.style.color = hoverColor;
        }
      }}
      onMouseLeave={event => {
        if (!active) {
          event.currentTarget.style.backgroundColor = restingBackground;
          event.currentTarget.style.color = restingColor;
        }
      }}
    >
      {icon && (
        <span
          style={{
            fontSize: theme.typography.fontSize.lg,
            display: 'flex',
            alignItems: 'center',
            width: isCollapsed ? 'auto' : '20px',
            justifyContent: 'center',
          }}
        >
          {icon}
        </span>
      )}
      {!isCollapsed && <span style={{ flex: 1 }}>{label}</span>}
      {badge !== undefined && badge > 0 && <SidebarBadge count={badge} isCollapsed={isCollapsed} />}
    </Link>
  );
};

const getGroupKey = (label: string): string => {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
};

const SETTINGS_EXPANDED_DEFAULTS: Record<string, boolean> = {
  'account-security': true,
  'email-delivery': true,
  'guide-our-ai': true,
  scheduling: true,
  'integrations-apps': true,
  'team-plan': true,
  'data-account': true,
};

interface RenderNavItemProps {
  item: SettingsSubNavItem | SettingsSubNavGroup;
  hash?: string;
  expandedGroups: Record<string, boolean>;
  scrollToSection: (anchor: string) => void;
  onToggleGroup: (groupKey: string, isExpanded: boolean) => void;
}

function renderNavItem({ item, hash, expandedGroups, scrollToSection, onToggleGroup }: RenderNavItemProps) {
  if ('items' in item) {
    const groupKey = getGroupKey(item.label);
    const isExpanded = expandedGroups[groupKey] ?? true;
    return (
      <SettingsSubNavGroupComponent
        key={item.label}
        label={item.label}
        items={item.items}
        isExpanded={isExpanded}
        hash={hash}
        onToggle={() => onToggleGroup(groupKey, isExpanded)}
        onScrollToSection={scrollToSection}
      />
    );
  }
  return (
    <SettingsSubNavItemComponent
      key={item.id}
      id={item.id}
      label={item.label}
      anchor={item.anchor}
      hash={hash}
      onScrollToSection={scrollToSection}
    />
  );
}

export const SettingsSubNav: React.FC<{ hash?: string; isAdmin?: boolean }> = ({ hash, isAdmin }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(SETTINGS_EXPANDED_DEFAULTS);
  const scrollToSection = makeScrollToSection(navigate);
  const navItems = getSettingsNavItems(t, { isAdmin });
  const handleToggleGroup = (groupKey: string, isExpanded: boolean) => {
    setExpandedGroups(prev => ({ ...prev, [groupKey]: !isExpanded }));
  };

  return (
    <div style={{ marginLeft: theme.spacing.md, marginTop: theme.spacing.xs }}>
      {navItems.map(item =>
        renderNavItem({ item, hash, expandedGroups, scrollToSection, onToggleGroup: handleToggleGroup })
      )}
    </div>
  );
};

interface SidebarProps {
  user: User | null;
  logout: () => void;
  isCollapsed?: boolean;
  canToggleCollapse?: boolean;
  onToggleCollapse?: () => void;
  isMobileMenuOpen?: boolean;
  onCloseMobileMenu?: () => void;
}

interface CrmSubNavProps {
  pathname: string;
  isCollapsed: boolean;
  translate: (tKey: string) => string;
  onNavigationClick: (path: string) => void;
}

const CrmSubNav: React.FC<CrmSubNavProps> = ({ pathname, isCollapsed, translate, onNavigationClick }) => {
  if (isCollapsed || !pathname.startsWith('/crm')) {
    return null;
  }
  return (
    <div style={{ marginLeft: theme.spacing.lg, marginBottom: theme.spacing.xs }}>
      <SidebarItem
        label={translate('crm.contacts')}
        path={ROUTE_CRM_CONTACTS}
        icon="👤"
        active={pathname === ROUTE_CRM_CONTACTS || pathname.startsWith(`${ROUTE_CRM_CONTACTS}/`)}
        isCollapsed={false}
        onNavigationClick={onNavigationClick}
      />
      <SidebarItem
        label={translate('crm.deals')}
        path={ROUTE_CRM_DEALS}
        icon="🤝"
        active={pathname === ROUTE_CRM_DEALS}
        isCollapsed={false}
        onNavigationClick={onNavigationClick}
      />
      <SidebarItem
        label={translate('crm.contactGroups')}
        path={ROUTE_CRM_CONTACT_GROUPS}
        icon="👥"
        active={pathname === ROUTE_CRM_CONTACT_GROUPS}
        isCollapsed={false}
        onNavigationClick={onNavigationClick}
      />
    </div>
  );
};

interface SidebarNavProps {
  translate: (tKey: string) => string;
  location: { pathname: string; search: string; hash: string };
  isCollapsed: boolean;
  effectiveIsCollapsed: boolean;
  isSettingsPage: boolean;
  isAdmin?: boolean;
  handleNavigationClick: (path: string) => void;
}

const SidebarNav: React.FC<SidebarNavProps> = ({
  translate,
  location,
  isCollapsed,
  effectiveIsCollapsed,
  isSettingsPage,
  isAdmin,
  handleNavigationClick,
}) => (
  <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingRight: theme.spacing.xs }}>
    <SidebarItem
      label={translate('inbox.title')}
      path={ROUTE_INBOX}
      icon="📥"
      active={location.pathname === ROUTE_INBOX}
      isCollapsed={effectiveIsCollapsed}
      onNavigationClick={handleNavigationClick}
    />
    <SidebarItem
      label={translate('compose.title')}
      path={ROUTE_COMPOSE}
      icon="✏️"
      active={location.pathname === ROUTE_COMPOSE}
      isCollapsed={effectiveIsCollapsed}
      onNavigationClick={handleNavigationClick}
    />
    <SidebarItem
      label={translate('common.search')}
      path={ROUTE_SEARCH}
      icon="🔍"
      active={location.pathname === ROUTE_SEARCH}
      isCollapsed={effectiveIsCollapsed}
      onNavigationClick={handleNavigationClick}
    />
    <SidebarItem
      label={translate('crm.title')}
      path={ROUTE_CRM_CONTACTS}
      icon="💼"
      active={location.pathname.startsWith('/crm')}
      isCollapsed={effectiveIsCollapsed}
      onNavigationClick={isCollapsed ? handleNavigationClick : undefined}
    />
    <CrmSubNav
      pathname={location.pathname}
      isCollapsed={isCollapsed}
      translate={translate}
      onNavigationClick={handleNavigationClick}
    />
    <SidebarItem
      label={translate('stats.title')}
      path={ROUTE_STATS}
      icon="📊"
      active={location.pathname === ROUTE_STATS}
      isCollapsed={effectiveIsCollapsed}
      onNavigationClick={handleNavigationClick}
    />
    <div style={{ marginTop: theme.spacing.xs }}>
      <SidebarItem
        label={translate('settings.title')}
        path={ROUTE_SETTINGS}
        icon="⚙️"
        active={isSettingsPage}
        isCollapsed={effectiveIsCollapsed}
        onNavigationClick={handleNavigationClick}
      />
      {!effectiveIsCollapsed && isSettingsPage && <SettingsSubNav hash={location.hash} isAdmin={isAdmin} />}
    </div>
    {isAdmin && (
      <div style={{ marginTop: theme.spacing.sm }}>
        <SidebarItem
          label={translate('admin.title')}
          path={ROUTE_ADMIN}
          icon="🛠️"
          active={location.pathname === ROUTE_ADMIN}
          isCollapsed={effectiveIsCollapsed}
          onNavigationClick={handleNavigationClick}
        />
      </div>
    )}
  </nav>
);

export const Sidebar: React.FC<SidebarProps> = ({
  user,
  logout,
  isCollapsed = false,
  canToggleCollapse = false,
  onToggleCollapse,
  isMobileMenuOpen = false,
  onCloseMobileMenu,
}) => {
  const { t } = useTranslation();
  const location = useLocation();
  const isSettingsPage = location.pathname === ROUTE_SETTINGS;
  const { isMobile, isTablet } = useResponsiveBreakpoints();
  const isNarrow = isMobile || isTablet;

  const handleNavigationClick = (path: string) => {
    const shouldKeepOpen = path === ROUTE_SETTINGS;
    if (isNarrow && onCloseMobileMenu && !shouldKeepOpen) {
      onCloseMobileMenu();
    }
  };

  const effectiveIsCollapsed = isCollapsed && !isNarrow;

  return (
    <>
      {isNarrow && isMobileMenuOpen && (
        <div
          onClick={onCloseMobileMenu}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 999,
          }}
        />
      )}
      <div
        style={{
          width: effectiveIsCollapsed ? '80px' : '220px',
          backgroundColor: theme.colors.background.paper,
          borderRight: `1px solid ${theme.colors.border.light}`,
          padding: effectiveIsCollapsed ? theme.spacing.sm : `${theme.spacing.sm} ${theme.spacing.md}`,
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          transition: 'width 0.3s ease, padding 0.3s ease',
          ...(isNarrow && {
            position: 'fixed' as const,
            left: 0,
            top: 0,
            zIndex: 1000,
            display: isMobileMenuOpen ? 'flex' : 'none',
            width: '220px',
            padding: `${theme.spacing.sm} ${theme.spacing.sm}`,
          }),
        }}
      >
        <SidebarHeader
          isCollapsed={effectiveIsCollapsed}
          canToggleCollapse={canToggleCollapse && !isNarrow}
          onToggleCollapse={onToggleCollapse}
        />
        <SidebarNav
          translate={t}
          location={location}
          isCollapsed={isCollapsed}
          effectiveIsCollapsed={effectiveIsCollapsed}
          isSettingsPage={isSettingsPage}
          isAdmin={user?.isAdmin}
          handleNavigationClick={handleNavigationClick}
        />
        <SidebarFooter userEmail={user?.email} onLogout={logout} isCollapsed={effectiveIsCollapsed} />
      </div>
    </>
  );
};
