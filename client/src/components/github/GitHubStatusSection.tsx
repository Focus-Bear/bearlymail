import React from 'react';
import { theme } from '../../theme/theme';
import { GitHubLink } from '../../types/email';
import { GitHubLinkCard } from './GitHubLinkCard';

interface GitHubStatusSectionProps {
  links: GitHubLink[];
  loading: boolean;
  hasToken: boolean;
  onRefresh: () => void;
}

export const GitHubStatusSection: React.FC<GitHubStatusSectionProps> = ({
  links,
  loading,
  hasToken,
  onRefresh,
}) => {
  if (!hasToken) {
    return null;
  }

  return (
    <div style={{
      backgroundColor: theme.colors.background.paper,
      borderRadius: theme.borderRadius.xl,
      padding: theme.spacing.lg,
      boxShadow: theme.shadows.sm,
      border: `1px solid ${theme.colors.border.light}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.md }}>
        <h3 style={{
          color: theme.colors.text.primary,
          margin: 0,
          fontSize: theme.typography.fontSize.lg,
          fontWeight: theme.typography.fontWeight.semibold,
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.sm,
        }}>
          🐙 GitHub Status
        </h3>
        <button
          onClick={onRefresh}
          disabled={loading}
          style={{
            background: 'transparent',
            border: 'none',
            color: theme.colors.primary.main,
            cursor: loading ? 'wait' : 'pointer',
            fontSize: theme.typography.fontSize.sm,
            fontWeight: theme.typography.fontWeight.medium,
            display: 'flex',
            alignItems: 'center',
            gap: theme.spacing.xs,
          }}
        >
          {loading ? (
            <>
              <span style={{
                display: 'inline-block',
                width: '12px',
                height: '12px',
                border: `2px solid ${theme.colors.primary.main}`,
                borderTop: '2px solid transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }} />
              Refreshing...
            </>
          ) : (
            <>🔄 Refresh</>
          )}
        </button>
      </div>

      {loading && links.length === 0 ? (
        <div style={{ textAlign: 'center', padding: theme.spacing.lg, color: theme.colors.text.secondary }}>
          <span style={{
            display: 'inline-block',
            width: '16px',
            height: '16px',
            border: `2px solid ${theme.colors.primary.main}`,
            borderTop: '2px solid transparent',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            marginRight: theme.spacing.sm,
          }} />
          Loading GitHub status...
        </div>
      ) : links.length === 0 ? (
        <div style={{ textAlign: 'center', padding: theme.spacing.lg, color: theme.colors.text.secondary }}>
          No GitHub links found in this email.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
          {links.map((link, i) => (
            <GitHubLinkCard key={i} link={link} />
          ))}
        </div>
      )}
    </div>
  );
};



