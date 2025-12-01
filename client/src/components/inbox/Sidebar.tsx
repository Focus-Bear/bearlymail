import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { theme } from '../../theme/theme';

interface SidebarItemProps {
  label: string;
  path: string;
  active?: boolean;
  onClick?: () => void;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ label, path, active, onClick }) => {
  const navigate = useNavigate();
  
  return (
    <button
      onClick={onClick || (() => navigate(path))}
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

interface SidebarProps {
  user: any;
  logout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ user, logout }) => {
  const { t } = useTranslation();
  const location = useLocation();

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
      
      <nav style={{ flex: 1 }}>
        <SidebarItem label={t('inbox.title')} path="/inbox" active={location.pathname === '/inbox'} />
        <SidebarItem label="🔍 Search" path="/search" active={location.pathname === '/search'} />
        <SidebarItem label={t('settings.title')} path="/settings" active={location.pathname === '/settings'} />
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
          onClick={logout}
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
          <a href="https://focusbear.io" target="_blank" rel="noopener noreferrer" style={{ color: theme.colors.text.tertiary, textDecoration: 'none' }}>
            Focus Bear
          </a>
        </span>
        <a href="https://focusbear.io" target="_blank" rel="noopener noreferrer">
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

