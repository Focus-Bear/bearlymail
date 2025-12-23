import React from 'react';
import { theme } from '../../theme/theme';

/**
 * Consent modal header component
 */
export const ConsentModalHeader: React.FC = () => {
  return (
    <>
      <h2
        style={{
          fontSize: theme.typography.fontSize['2xl'],
          fontWeight: theme.typography.fontWeight.bold,
          marginBottom: theme.spacing.lg,
          color: theme.colors.text.primary,
        }}
      >
        Welcome to BearlyMail
      </h2>

      <p
        style={{
          marginBottom: theme.spacing.lg,
          color: theme.colors.text.secondary,
          lineHeight: theme.typography.lineHeight.relaxed,
        }}
      >
        To continue using BearlyMail, please review and accept our Terms of Use and Privacy Policy.
      </p>
    </>
  );
};

