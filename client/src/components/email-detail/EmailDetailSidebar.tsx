import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { EMOJI_BACK } from 'constants/emojis';

export const EmailDetailSidebar: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div style={{
      width: '80px',
      backgroundColor: theme.colors.background.paper,
      borderRight: `1px solid ${theme.colors.border.light}`,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      paddingTop: theme.spacing.xl,
    }}>
      <button
        onClick={() => navigate('/inbox')}
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          border: `1px solid ${theme.colors.border.medium}`,
          backgroundColor: 'transparent',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.2rem',
          transition: theme.transitions.fast,
        }}
        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.colors.background.default}
        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        title={t('emailDetail.backToInbox')}
      >
        {/* eslint-disable-next-line i18next/no-literal-string */}
        {EMOJI_BACK}
      </button>
    </div>
  );
};


