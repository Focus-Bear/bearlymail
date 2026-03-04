import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation,useNavigate } from 'react-router-dom';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';

import { SettingsSubNavGroup as SettingsSubNavGroupComponent } from 'components/inbox/sidebar/SettingsSubNavGroup';
import { SettingsSubNavItem as SettingsSubNavItemComponent } from 'components/inbox/sidebar/SettingsSubNavItem';
import { SidebarFooter } from 'components/inbox/sidebar/SidebarFooter';
import { SidebarHeader } from 'components/inbox/sidebar/SidebarHeader';
import { COLOR_TRANSPARENT } from 'constants/colors';
import { CATEGORY_DANGEROUS_PHISHING, ROUTE_ADMIN, ROUTE_CRM_CONTACTS, ROUTE_CRM_DEALS, ROUTE_INBOX, ROUTE_SEARCH, ROUTE_SETTINGS, ROUTE_STATS, STRING_NONE } from 'constants/strings';
import { useResponsiveBreakpoints } from 'hooks/useResponsiveBreakpoints';

interface SidebarItemProps {
  label: string;
  path: string;
  icon?: string;
  active?: boolean;
  onClick?: () => void;
  isCollapsed?: boolean;
  onNavigationClick?: (path: string) => void;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ label, path, icon, active, onClick, isCollapsed, onNavigationClick }) => {
  const navigate = useNavigate();

  const handleClick = () => {
    if (path === ROUTE_INBOX) captureEvent('sidebar_inbox_clicked');
    else if (path === ROUTE_SEARCH) captureEvent('sidebar_search_clicked');
    else if (path === ROUTE_CRM_CONTACTS) captureEvent('sidebar_contacts_clicked');
    else if (path === ROUTE_CRM_DEALS) captureEvent('sidebar_deals_clicked');
    else if (path === ROUTE_STATS) captureEvent('sidebar_stats_clicked');
    else if (path === ROUTE_SETTINGS) captureEvent('sidebar_settings_clicked');
    else if (path === ROUTE_ADMIN) captureEvent('sidebar_admin_clicked');
    if (onClick) {
      onClick();
    } else {
      navigate(path);
    }
    // Call navigation click handler (for closing mobile menu)
    if (onNavigationClick) {
      onNavigationClick(path);
    }
  };

  return (
    <button
      onClick={handleClick}
      title={isCollapsed ? label : undefined}
      style={{
        width: '100%',
        padding: isCollapsed ? `${theme.spacing.sm} ${theme.spacing.xs}` : `${theme.spacing.sm} ${theme.spacing.md}`,
        marginBottom: theme.spacing.xs,
        backgroundColor: active ? theme.colors.primary.main : 'transparent',
        color: active ? 'white' : theme.colors.text.secondary,
        border: STRING_NONE,
        borderRadius: theme.borderRadius.md,
        cursor: 'pointer',
        fontSize: theme.typography.fontSize.base,
        fontWeight: active ? theme.typography.fontWeight.semibold : theme.typography.fontWeight.medium,
        textAlign: 'left',
        display: 'flex',
        alignItems: 'center',
        justifyContent: isCollapsed ? 'center' : 'flex-start',
        gap: theme.spacing.sm,
        transition: theme.transitions.fast,
        position: 'relative',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.backgroundColor = theme.colors.background.default;
          e.currentTarget.style.color = theme.colors.text.primary;
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.backgroundColor = COLOR_TRANSPARENT;
          e.currentTarget.style.color = theme.colors.text.secondary;
        }
      }}
    >
      {icon && (
        <span style={{ 
          fontSize: theme.typography.fontSize.lg,
          display: 'flex',
          alignItems: 'center',
          width: isCollapsed ? 'auto' : '20px',
          justifyContent: 'center',
        }}>
          {icon}
        </span>
      )}
      {!isCollapsed && <span>{label}</span>}
    </button>
  );
};

interface SettingsSubNavItemType {
  id: string;
  label: string;
  anchor: string;
}

interface SettingsSubNavGroupType {
  label: string;
  items: SettingsSubNavItemType[];
}

const getGroupKey = (label: string): string => {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
};

const SettingsSubNav: React.FC<{ hash?: string }> = ({ hash }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    'email-delivery': true,
    'guide-our-ai': true,
    'scheduling': true,
    'integrations': true,
  });

  const scrollToSection = (anchor: string) => {
    navigate(`/settings#${anchor}`, { replace: true });
    const SCROLL_DELAY_MS = 50;
    setTimeout(() => {
      const element = document.getElementById(anchor);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, SCROLL_DELAY_MS);
  };

  const navItems: (SettingsSubNavItemType | SettingsSubNavGroupType)[] = [
    {
      label: t('settings.nav.emailDelivery'),
      items: [
        { id: 'google-accounts', label: t('settings.nav.googleAccounts'), anchor: 'google-accounts' },
        { id: 'email-batching', label: t('settings.nav.emailBatching'), anchor: 'email-batching' },
        { id: 'blocked-senders', label: t('settings.nav.blockedSenders'), anchor: 'blocked-senders' },
      ],
    },
    {
      label: t('settings.nav.guideOurAI'),
      items: [
        { id: 'context', label: t('settings.contextAboutMeTitle'), anchor: 'context' },
        { id: 'email-categories', label: t('settings.nav.emailCategories'), anchor: 'email-categories' },
        { id: 'tone-settings', label: t('settings.nav.toneSettings'), anchor: 'tone-settings' },
        { id: 'summarization', label: t('settings.nav.summarization'), anchor: 'summarization' },
        { id: 'auto-responder', label: t('settings.nav.autoResponder'), anchor: 'auto-responder' },
      ],
    },
    {
      label: t('settings.nav.schedulingPreferences'),
      items: [
        { id: 'scheduling-availability', label: t('settings.nav.schedulingAvailability'), anchor: 'scheduling-availability' },
        { id: 'scheduling-meeting-gap', label: t('settings.nav.schedulingMeetingGap'), anchor: 'scheduling-meeting-gap' },
        { id: 'scheduling-deep-work', label: t('settings.nav.schedulingDeepWork'), anchor: 'scheduling-deep-work' },
        { id: 'scheduling-slot-duration', label: t('settings.nav.schedulingSlotDuration'), anchor: 'scheduling-slot-duration' },
      ],
    },
    {
      label: t('settings.nav.integrations'),
      items: [
        { id: 'api-key', label: t('settings.nav.openAiApiKey'), anchor: 'api-key' },
        { id: 'github-integration', label: t('settings.nav.githubIntegration'), anchor: 'github-integration' },
      ],
    },
  ];

  return (
    <div style={{ marginLeft: theme.spacing.md, marginTop: theme.spacing.xs }}>
      {navItems.map((item) => {
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
              onToggle={() => setExpandedGroups(prev => ({ ...prev, [groupKey]: !isExpanded }))}
              onScrollToSection={scrollToSection}
            />
          );
        } else {
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
      })}
    </div>
  );
};

interface SidebarProps {
  user: any;
  logout: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  isMobileMenuOpen?: boolean;
  onCloseMobileMenu?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  user,
  logout,
  isCollapsed = false,
  onToggleCollapse,
  isMobileMenuOpen = false,
  onCloseMobileMenu
}) => {
  const { t } = useTranslation();
  const location = useLocation();
  const isSettingsPage = location.pathname === ROUTE_SETTINGS;
  const { isMobile, isTablet } = useResponsiveBreakpoints();
  // Use overlay mode for any non-desktop viewport (mobile + tablet)
  const isNarrow = isMobile || isTablet;

  // On narrow screens, clicking a navigation item should close the menu
  const handleNavigationClick = (path: string) => {
    const shouldKeepOpen = path === ROUTE_SETTINGS;
    if (isNarrow && onCloseMobileMenu && !shouldKeepOpen) {
      onCloseMobileMenu();
    }
  };

  const effectiveIsCollapsed = isCollapsed && !isNarrow;

  return (
    <>
      {/* Overlay backdrop for mobile/tablet */}
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

      {/* Sidebar */}
      <div style={{
        width: effectiveIsCollapsed ? '80px' : '280px',
        backgroundColor: theme.colors.background.paper,
        borderRight: `1px solid ${theme.colors.border.light}`,
        padding: effectiveIsCollapsed ? theme.spacing.sm : `${theme.spacing.sm} ${theme.spacing.md}`,
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        transition: 'width 0.3s ease, padding 0.3s ease, transform 0.3s ease',
        // Overlay sidebar for mobile/tablet
        ...(isNarrow && {
          position: 'fixed',
          left: 0,
          top: 0,
          zIndex: 1000,
          transform: isMobileMenuOpen ? 'translateX(0)' : 'translateX(-100%)',
          width: '240px',
          padding: `${theme.spacing.sm} ${theme.spacing.sm}`,
        }),
      }}>
        <SidebarHeader isCollapsed={effectiveIsCollapsed} />

        <nav style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          paddingRight: theme.spacing.xs,
        }}>
          <SidebarItem
            label={t('inbox.title')}
            path={ROUTE_INBOX}
            icon="📥"
            active={location.pathname === ROUTE_INBOX}
            isCollapsed={effectiveIsCollapsed}
            onNavigationClick={handleNavigationClick}
          />
          <SidebarItem
            label={t('phishing.sidebarLabel')}
            path={ROUTE_INBOX}
            icon="🛑"
            active={location.pathname === ROUTE_INBOX && location.search.includes(encodeURIComponent(CATEGORY_DANGEROUS_PHISHING))}
            onClick={() => {
              captureEvent('sidebar_phishing_filter_clicked');
              window.dispatchEvent(new CustomEvent('inbox:filterPhishing'));
            }}
            isCollapsed={effectiveIsCollapsed}
            onNavigationClick={handleNavigationClick}
          />
          <SidebarItem
            label="Search"
            path={ROUTE_SEARCH}
            icon="🔍"
            active={location.pathname === ROUTE_SEARCH}
            isCollapsed={effectiveIsCollapsed}
            onNavigationClick={handleNavigationClick}
          />
          <SidebarItem
            label={t('crm.title')}
            path={ROUTE_CRM_CONTACTS}
            icon="💼"
            active={location.pathname.startsWith('/crm')}
            isCollapsed={effectiveIsCollapsed}
            onNavigationClick={isCollapsed ? handleNavigationClick : undefined}
          />
          {!isCollapsed && location.pathname.startsWith('/crm') && (
            <div style={{ marginLeft: theme.spacing.lg, marginBottom: theme.spacing.xs }}>
              <SidebarItem
                label={t('crm.contacts')}
                path={ROUTE_CRM_CONTACTS}
                icon="👤"
                active={location.pathname === ROUTE_CRM_CONTACTS || location.pathname.startsWith(`${ROUTE_CRM_CONTACTS}/`)}
                isCollapsed={false}
                onNavigationClick={handleNavigationClick}
              />
              <SidebarItem
                label={t('crm.deals')}
                path={ROUTE_CRM_DEALS}
                icon="🤝"
                active={location.pathname === ROUTE_CRM_DEALS}
                isCollapsed={false}
                onNavigationClick={handleNavigationClick}
              />
            </div>
          )}
          <SidebarItem
            label={t('stats.title')}
            path={ROUTE_STATS}
            icon="📊"
            active={location.pathname === ROUTE_STATS}
            isCollapsed={effectiveIsCollapsed}
            onNavigationClick={handleNavigationClick}
          />
          {!effectiveIsCollapsed && (
            <div style={{ marginTop: theme.spacing.xs }}>
              <SidebarItem
                label={t('settings.title')}
                path={ROUTE_SETTINGS}
                icon="⚙️"
                active={isSettingsPage}
                isCollapsed={effectiveIsCollapsed}
                onNavigationClick={handleNavigationClick}
              />
              {isSettingsPage && <SettingsSubNav hash={location.hash} />}
            </div>
          )}
          {effectiveIsCollapsed && (
            <div style={{ marginTop: theme.spacing.xs }}>
              <SidebarItem
                label={t('settings.title')}
                path={ROUTE_SETTINGS}
                icon="⚙️"
                active={isSettingsPage}
                isCollapsed={effectiveIsCollapsed}
                onNavigationClick={handleNavigationClick}
              />
            </div>
          )}
          {user?.isAdmin && (
            <div style={{ marginTop: theme.spacing.sm }}>
              <SidebarItem
                label={t('admin.title')}
                path={ROUTE_ADMIN}
                icon="🛠️"
                active={location.pathname === ROUTE_ADMIN}
                isCollapsed={effectiveIsCollapsed}
                onNavigationClick={handleNavigationClick}
              />
            </div>
          )}
        </nav>

        <SidebarFooter userEmail={user?.email} onLogout={logout} isCollapsed={effectiveIsCollapsed} onToggleCollapse={onToggleCollapse} />
      </div>
    </>
  );
};
