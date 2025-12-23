import React from 'react';
import { useNavigate } from 'react-router-dom';
import { theme } from '../../theme/theme';

/**
 * Success state component
 * Shown after successful waitlist submission
 */
export const WaitlistSuccess: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: theme.colors.background.default,
        padding: theme.spacing.xl,
      }}
    >
      <div
        style={{
          backgroundColor: theme.colors.background.paper,
          padding: theme.spacing['2xl'],
          borderRadius: theme.borderRadius.lg,
          boxShadow: theme.shadows.lg,
          maxWidth: '600px',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '4rem', marginBottom: theme.spacing.md }}>✅</div>
        <h1
          style={{
            color: theme.colors.text.primary,
            marginBottom: theme.spacing.md,
            fontSize: theme.typography.fontSize['3xl'],
          }}
        >
          You're on the list!
        </h1>
        <p
          style={{
            color: theme.colors.text.secondary,
            marginBottom: theme.spacing.xl,
            lineHeight: 1.6,
          }}
        >
          We'll review your request and send you an email when your account is approved.
        </p>
        <button
          onClick={() => navigate('/login')}
          style={{
            padding: `${theme.spacing.md} ${theme.spacing.xl}`,
            backgroundColor: theme.colors.primary.main,
            color: 'white',
            border: 'none',
            borderRadius: theme.borderRadius.md,
            fontSize: theme.typography.fontSize.base,
            fontWeight: theme.typography.fontWeight.semibold,
            cursor: 'pointer',
          }}
        >
          Go to Login
        </button>
      </div>
    </div>
  );
};



