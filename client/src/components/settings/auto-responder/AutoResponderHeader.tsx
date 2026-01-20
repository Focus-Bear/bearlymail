import React from 'react';
import { theme } from 'theme/theme';

export const AutoResponderHeader: React.FC = () => {
  return (
    <div style={{ marginBottom: theme.spacing.lg }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm }}>
        <span style={{ fontSize: '1.5rem' }}>🤖</span>
        <h2 style={{
          ...theme.typography.heading.h4,
          color: theme.colors.text.primary,
          margin: 0,
        }}>
          Auto-Responder
        </h2>
      </div>
      <p style={{
        ...theme.typography.body.large,
        color: theme.colors.text.secondary,
        marginTop: theme.spacing.sm,
        marginBottom: 0,
      }}>
        Automatically respond to new emails with queue status and helpful information.
        The auto-responder can even answer common questions based on your email history.
      </p>
    </div>
  );
};
