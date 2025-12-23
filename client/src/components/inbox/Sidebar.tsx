import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { theme } from '../../theme/theme';
import { captureEvent } from '../../utils/posthog';

interface SidebarItemProps {
  label: string;
  path: string;
  active?: boolean;
  onClick?: () => void;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ label, path, active, onClick }) => {
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
      style={{
        width: '100%',
        padding: `${theme.spacing.md} ${theme.spacing.lg}`,
        marginBottom: theme.spacing.xs,
        backgroundColor: active ? theme.colors.primary.subtle : 'transparent',
        color: active ? theme.colors.primary.main : theme.colors.text.secondary,
        border: 'none',
        borderRadius: theme.borderRadius.md,
        cursor: 'pointer',
        fontSize: theme.typography.fontSize.base,
        fontWeight: active ? theme.typography.fontWeight.semibold : theme.typography.fontWeight.medium,
        textAlign: 'left',
        display: 'flex',
        alignItems: 'center',
        transition: theme.transitions.fast,
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.backgroundColor = theme.colors.background.default;
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.backgroundColor = 'transparent';
      }}
    >
      {label}
    </button>
  );
};

interface SettingsSubNavItem {
  id: string;
  label: string;
  anchor: string;
}

interface SettingsSubNavGroup {
  label: string;
  items: SettingsSubNavItem[];
}

const SettingsSubNav: React.FC<{ hash?: string }> = ({ hash }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    'email-delivery': true,
    'guide-our-ai': true,
    'integrations': true,
  });
  
  // Generate a group key from label for state tracking
  const getGroupKey = (label: string): string => {
    return label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  };

  const scrollToSection = (anchor: string) => {
    navigate(`/settings#${anchor}`, { replace: true });
    setTimeout(() => {
      const element = document.getElementById(anchor);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 50);
  };

  // Organized in logical groups:
  // 1. Email Delivery (Gmail, Batching, Blocked Senders)
  // 2. Guide our AI (Context, Tone, Summarization)
  // 3. Integrations (External services)
  const navItems: (SettingsSubNavItem | SettingsSubNavGroup)[] = [
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
          // It's a group
          const groupKey = getGroupKey(item.label);
          const isExpanded = expandedGroups[groupKey] ?? true;
          
          return (
            <div key={item.label} style={{ marginBottom: theme.spacing.xs }}>
              <button
                onClick={() => setExpandedGroups(prev => ({ ...prev, [groupKey]: !isExpanded }))}
                style={{
                  width: '100%',
                  padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                  backgroundColor: 'transparent',
                  color: theme.colors.text.secondary,
                  border: 'none',
                  borderRadius: theme.borderRadius.sm,
                  cursor: 'pointer',
                  fontSize: theme.typography.fontSize.sm,
                  fontWeight: theme.typography.fontWeight.semibold,
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span>{item.label}</span>
                <span style={{ fontSize: theme.typography.fontSize.sm }}>
                  {isExpanded ? '▼' : '▶'}
                </span>
              </button>
              {isExpanded && (
                <div style={{ marginLeft: theme.spacing.md, marginTop: theme.spacing.xs }}>
                  {item.items.map((subItem) => (
                    <button
                      key={subItem.id}
                      onClick={() => scrollToSection(subItem.anchor)}
                      style={{
                        width: '100%',
                        padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                        backgroundColor: hash === `#${subItem.anchor}` ? theme.colors.primary.subtle : 'transparent',
                        color: hash === `#${subItem.anchor}` ? theme.colors.primary.main : theme.colors.text.tertiary,
                        border: 'none',
                        borderRadius: theme.borderRadius.sm,
                        cursor: 'pointer',
                        fontSize: theme.typography.fontSize.sm,
                        fontWeight: theme.typography.fontWeight.medium,
                        textAlign: 'left',
                      }}
                    >
                      {subItem.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        } else {
          // It's a regular item
          return (
            <button
              key={item.id}
              onClick={() => scrollToSection(item.anchor)}
              style={{
                width: '100%',
                padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                marginBottom: theme.spacing.xs,
                backgroundColor: hash === `#${item.anchor}` ? theme.colors.primary.subtle : 'transparent',
                color: hash === `#${item.anchor}` ? theme.colors.primary.main : theme.colors.text.tertiary,
                border: 'none',
                borderRadius: theme.borderRadius.sm,
                cursor: 'pointer',
                fontSize: theme.typography.fontSize.sm,
                fontWeight: theme.typography.fontWeight.medium,
                textAlign: 'left',
              }}
            >
              {item.label}
            </button>
          );
        }
      })}
    </div>
  );
};

interface SidebarProps {
  user: any;
  logout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ user, logout }) => {
  const { t } = useTranslation();
  const location = useLocation();
  const isSettingsPage = location.pathname === '/settings';

  return (
    <div style={{
      width: '280px',
      backgroundColor: theme.colors.background.paper,
      borderRight: `1px solid ${theme.colors.border.light}`,
      padding: theme.spacing.lg,
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{ marginBottom: theme.spacing['2xl'], paddingLeft: theme.spacing.md, display: 'flex', alignItems: 'center', gap: theme.spacing.sm }}>
        <img 
          src="/favicon.svg" 
          alt="BearlyMail Icon" 
          style={{ 
            height: '28px', 
            width: 'auto',
            objectFit: 'contain'
          }}
        />
        <h2 style={{
          color: theme.colors.primary.main,
          fontSize: theme.typography.fontSize.xl,
          fontWeight: theme.typography.fontWeight.bold,
          letterSpacing: '-0.02em',
        }}>
          {t('common.appName')}
        </h2>
      </div>
      
      <nav style={{ flex: 1, overflowY: 'auto' }}>
        <SidebarItem label={t('inbox.title')} path="/inbox" active={location.pathname === '/inbox'} />
        <SidebarItem label="🔍 Search" path="/search" active={location.pathname === '/search'} />
        <div>
          <SidebarItem label={t('settings.title')} path="/settings" active={isSettingsPage} />
          {isSettingsPage && <SettingsSubNav hash={location.hash} />}
        </div>
        {user?.isAdmin && (
          <SidebarItem label={t('admin.title')} path="/admin" active={location.pathname === '/admin'} />
        )}
      </nav>

      <div style={{ borderTop: `1px solid ${theme.colors.border.light}`, paddingTop: theme.spacing.md }}>
        <div style={{
          padding: theme.spacing.md,
          fontSize: theme.typography.fontSize.sm,
          color: theme.colors.text.secondary,
          marginBottom: theme.spacing.sm,
        }}>
          {user?.email}
        </div>
        <button
          onClick={() => {
            captureEvent('sidebar_logout_clicked');
            logout();
          }}
          style={{
            width: '100%',
            padding: theme.spacing.md,
            backgroundColor: 'transparent',
            color: theme.colors.text.secondary,
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.md,
            cursor: 'pointer',
            fontSize: theme.typography.fontSize.sm,
            fontWeight: theme.typography.fontWeight.medium,
            transition: theme.transitions.fast,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = theme.colors.text.primary;
            e.currentTarget.style.color = theme.colors.text.primary;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = theme.colors.border.medium;
            e.currentTarget.style.color = theme.colors.text.secondary;
          }}
        >
          {t('auth.logout')}
        </button>
      </div>
      <footer style={{ marginTop: theme.spacing.xl, textAlign: 'center' }}>
        <span style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.text.tertiary }}>
          Made by{' '}
        <a href="https://focusbear.io" target="_blank" rel="noopener noreferrer" onClick={() => captureEvent('sidebar_focusbear_link_clicked')} style={{ color: theme.colors.text.tertiary, textDecoration: 'none' }}>
          Focus Bear
        </a>
        </span>
        <a href="https://focusbear.io" target="_blank" rel="noopener noreferrer" onClick={() => captureEvent('sidebar_focusbear_link_clicked')}>
          <img 
            src="https://focus-bear.github.io/assets/focus-blocked/images/FocusBearLogo.svg" 
            alt="Focus Bear Logo" 
            style={{ height: '20px', marginLeft: theme.spacing.xs, verticalAlign: 'middle' }} 
          />
        </a>
      </footer>
    </div>
  );
};

