import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

export const AppFooter: React.FC = () => {
  const { t } = useTranslation();
  
  return (
    <footer style={{
      padding: theme.spacing.lg,
      borderTop: `1px solid ${theme.colors.border.light}`,
      backgroundColor: theme.colors.background.paper,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      gap: theme.spacing.sm,
    }}>
      <span style={{
        color: theme.colors.text.secondary,
        fontSize: theme.typography.fontSize.sm,
      }}>
        {t('footer.madeBy')}
      </span>
      <a 
        href="https://focusbear.io" 
        target="_blank" 
        rel="noopener noreferrer"
        style={{
          display: 'flex',
          alignItems: 'center',
          textDecoration: 'none',
        }}
      >
        <img 
          src="https://focus-bear.github.io/assets/focus-blocked/images/FocusBearLogo.svg" 
          alt="Focus Bear" 
          style={{ 
            height: '24px',
            width: 'auto',
            objectFit: 'contain'
          }}
        />
      </a>
    </footer>
  );
};







