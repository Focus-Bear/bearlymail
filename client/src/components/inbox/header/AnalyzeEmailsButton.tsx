import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';

interface AnalyzeEmailsButtonProps {
  hasRunAnalysis: boolean | null;
}

export const AnalyzeEmailsButton: React.FC<AnalyzeEmailsButtonProps> = ({ hasRunAnalysis }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  if (hasRunAnalysis !== false) {
    return null;
  }

  return (
    <button
      onClick={() => {
        captureEvent('analyze_emails_button_clicked');
        navigate('/settings#context');
      }}
      style={{
        padding: `${theme.spacing.xs} ${theme.spacing.md}`,
        backgroundColor: theme.colors.accent.info,
        color: 'white',
        border: 'none',
        borderRadius: theme.borderRadius.md,
        cursor: 'pointer',
        fontSize: theme.typography.fontSize.xs,
        fontWeight: theme.typography.fontWeight.medium,
        transition: theme.transitions.fast,
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.backgroundColor = theme.colors.button.primary.hover)
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.backgroundColor = theme.colors.accent.info)
      }
    >
      {t('settings.analyzeEmails')}
    </button>
  );
};



