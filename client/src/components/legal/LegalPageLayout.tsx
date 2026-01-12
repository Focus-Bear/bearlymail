import React from 'react';
import { useNavigate } from 'react-router-dom';
import { theme } from 'theme/theme';

interface LegalPageLayoutProps {
  title: string;
  children: React.ReactNode;
}

export const LegalPageLayout: React.FC<LegalPageLayoutProps> = ({ title, children }) => {
  const navigate = useNavigate();

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: theme.colors.background.default,
      padding: theme.spacing.xl,
      maxWidth: '900px',
      margin: '0 auto',
    }}>
      <button
        onClick={() => navigate(-1)}
        style={{
          background: 'transparent',
          border: 'none',
          color: theme.colors.primary.main,
          cursor: 'pointer',
          fontSize: theme.typography.fontSize.base,
          marginBottom: theme.spacing.lg,
          textDecoration: 'underline',
        }}
      >
        ← Back
      </button>

      <h1 style={{
        fontSize: theme.typography.fontSize['3xl'],
        fontWeight: theme.typography.fontWeight.bold,
        marginBottom: theme.spacing.lg,
        color: theme.colors.text.primary,
      }}>
        {title}
      </h1>

      <div style={{
        backgroundColor: theme.colors.background.paper,
        padding: theme.spacing.xl,
        borderRadius: theme.borderRadius.lg,
        boxShadow: theme.shadows.sm,
        lineHeight: theme.typography.lineHeight.relaxed,
        color: theme.colors.text.primary,
      }}>
        <p style={{ marginBottom: theme.spacing.md, fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary }}>
          Last updated: {new Date().toLocaleDateString()}
        </p>
        {children}
      </div>
    </div>
  );
};





