import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';

export const ComposeButton: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <button
      onClick={() => {
        captureEvent('compose_button_clicked');
        navigate('/compose');
      }}
      style={{
        padding: `${theme.spacing.xs} ${theme.spacing.md}`,
        backgroundColor: theme.colors.secondary.main,
        color: 'white',
        border: 'none',
        borderRadius: theme.borderRadius.md,
        cursor: 'pointer',
        fontSize: theme.typography.fontSize.xs,
        fontWeight: theme.typography.fontWeight.medium,
        transition: theme.transitions.fast,
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.backgroundColor = theme.colors.secondary.dark)
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.backgroundColor = theme.colors.secondary.main)
      }
    >
      {t('compose.title')}
    </button>
  );
};



