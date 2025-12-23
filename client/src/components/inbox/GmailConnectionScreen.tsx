import React from 'react';
import { theme } from '../../theme/theme';
import { API_URL } from '../../config/api';
import { captureEvent } from '../../utils/posthog';

export const GmailConnectionScreen: React.FC = () => {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      backgroundColor: theme.colors.background.default,
      padding: theme.spacing.xl,
    }}>
      <div style={{
        backgroundColor: theme.colors.background.paper,
        padding: theme.spacing['2xl'],
        borderRadius: theme.borderRadius.lg,
        boxShadow: theme.shadows.lg,
        maxWidth: '500px',
        textAlign: 'center',
      }}>
        <h1 style={{
          color: theme.colors.text.primary,
          marginBottom: theme.spacing.lg,
          fontSize: theme.typography.fontSize['2xl'],
          fontWeight: theme.typography.fontWeight.bold,
        }}>
          Connect Your Gmail Account
        </h1>
        <p style={{
          color: theme.colors.text.secondary,
          marginBottom: theme.spacing.xl,
          fontSize: theme.typography.fontSize.base,
          lineHeight: 1.6,
        }}>
          To use BearlyMail, you need to connect at least one Gmail account. This allows us to sync and manage your emails.
        </p>
        <button
          onClick={() => {
            captureEvent('gmail_connection_initiated');
            window.location.href = `${API_URL}/google-accounts/connect`;
          }}
          style={{
            padding: `${theme.spacing.md} ${theme.spacing.xl}`,
            backgroundColor: theme.colors.primary.main,
            color: 'white',
            border: 'none',
            borderRadius: theme.borderRadius.md,
            fontSize: theme.typography.fontSize.base,
            fontWeight: theme.typography.fontWeight.semibold,
            cursor: 'pointer',
            marginBottom: theme.spacing.md,
          }}
        >
          Connect Gmail Account
        </button>
        <p style={{
          fontSize: theme.typography.fontSize.sm,
          color: theme.colors.text.tertiary,
          marginTop: theme.spacing.lg,
        }}>
          You can connect multiple Gmail accounts from Settings after connecting your first account.
        </p>
      </div>
    </div>
  );
};

