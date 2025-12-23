import React from 'react';
import { theme } from '../../../theme/theme';

interface ReloginBannerProps {
  onLogout: () => void;
}

/**
 * Re-login banner component
 */
export const ReloginBanner: React.FC<ReloginBannerProps> = ({ onLogout }) => {
  return (
    <div
      style={{
        backgroundColor: theme.colors.accent.error,
        color: 'white',
        padding: theme.spacing.md,
        textAlign: 'center',
        fontWeight: theme.typography.fontWeight.medium,
      }}
    >
      Action Required: Please{' '}
      <a
        href="/login"
        style={{ color: 'white', textDecoration: 'underline' }}
        onClick={onLogout}
      >
        log in again
      </a>{' '}
      to restore email synchronization.
    </div>
  );
};

