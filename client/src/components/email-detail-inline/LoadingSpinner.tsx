import React from 'react';
import { theme } from 'theme/theme';

export const LoadingSpinner: React.FC = () => {
  return (
    <div style={{ padding: theme.spacing.xl, textAlign: 'center' }}>
      <div
        style={{
          width: '24px',
          height: '24px',
          border: `2px solid ${theme.colors.border.light}`,
          borderTop: `2px solid ${theme.colors.primary.main}`,
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          margin: '0 auto',
        }}
      />
    </div>
  );
};
