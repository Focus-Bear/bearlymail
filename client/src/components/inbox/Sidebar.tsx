import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';
import { SidebarHeader } from 'components/inbox/sidebar/SidebarHeader';
import { SidebarFooter } from 'components/inbox/sidebar/SidebarFooter';
import { SettingsSubNavGroup as SettingsSubNavGroupComponent } from 'components/inbox/sidebar/SettingsSubNavGroup';
import { SettingsSubNavItem as SettingsSubNavItemComponent } from 'components/inbox/sidebar/SettingsSubNavItem';

interface SidebarItemProps {
  label: string;
  path: string;
  icon?: string;
  active?: boolean;
  onClick?: () => void;
  isCollapsed?: boolean;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ label, path, icon, active, onClick, isCollapsed }) => {
  const navigate = useNavigate();
  
  const handleClick = () => {
    if (path === '/inbox') captureEvent('sidebar_inbox_clicked');
    else if (path === '/search') captureEvent('sidebar_search_clicked');
    else if (path === '/settings') captureEvent('sidebar_settings_clicked');
    else if (path === '/admin') captureEvent('sidebar_admin_clicked');
    if (onClick) {
      onClick();
    } else {
      navigate(path);
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
        backgroundColor: active ? theme.colors.primary.subtle : 'transparent',
        color: active ? theme.colors.primary.main : theme.colors.text.secondary,
        border: 'none',
        borderLeft: active ? `3px solid ${theme.colors.primary.main}` : '3px solid transparent',
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
          e.currentTarget.style.backgroundColor = 'transparent';
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
        { id: 'tone-settings', label: t('settings.nav.toneSettings'), anchor: 'tone-settings' },
        { id: 'summarization', label: t('settings.nav.summarization'), anchor: 'summarization' },
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
}

export const Sidebar: React.FC<SidebarProps> = ({ user, logout, isCollapsed = false }) => {
  const { t } = useTranslation();
  const location = useLocation();
  const isSettingsPage = location.pathname === '/settings';

  return (
    <div style={{
      width: isCollapsed ? '80px' : '280px',
      backgroundColor: theme.colors.background.paper,
      borderRight: `1px solid ${theme.colors.border.light}`,
      padding: isCollapsed ? theme.spacing.sm : `${theme.spacing.sm} ${theme.spacing.md}`,
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      transition: 'width 0.3s ease, padding 0.3s ease',
    }}>
      <SidebarHeader isCollapsed={isCollapsed} />
      
      <nav style={{ 
        flex: 1, 
        overflowY: 'auto', 
        overflowX: 'hidden',
        paddingRight: theme.spacing.xs,
      }}>
        <SidebarItem 
          label={t('inbox.title')} 
          path="/inbox" 
          icon="📥"
          active={location.pathname === '/inbox'}
          isCollapsed={isCollapsed}
        />
        <SidebarItem 
          label="Search" 
          path="/search" 
          icon="🔍"
          active={location.pathname === '/search'}
          isCollapsed={isCollapsed}
        />
        {!isCollapsed && (
          <div style={{ marginTop: theme.spacing.xs }}>
            <SidebarItem 
              label={t('settings.title')} 
              path="/settings" 
              icon="⚙️"
              active={isSettingsPage}
              isCollapsed={isCollapsed}
            />
            {isSettingsPage && <SettingsSubNav hash={location.hash} />}
          </div>
        )}
        {isCollapsed && (
          <div style={{ marginTop: theme.spacing.xs }}>
            <SidebarItem 
              label={t('settings.title')} 
              path="/settings" 
              icon="⚙️"
              active={isSettingsPage}
              isCollapsed={isCollapsed}
            />
          </div>
        )}
        {user?.isAdmin && (
          <div style={{ marginTop: theme.spacing.sm }}>
            <SidebarItem 
              label={t('admin.title')} 
              path="/admin" 
              icon="🛠️"
              active={location.pathname === '/admin'}
              isCollapsed={isCollapsed}
            />
          </div>
        )}
      </nav>

      <SidebarFooter userEmail={user?.email} onLogout={logout} isCollapsed={isCollapsed} />
    </div>
  );
};

