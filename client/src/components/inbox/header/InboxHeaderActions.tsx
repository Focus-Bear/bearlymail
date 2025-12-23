import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, Link } from 'react-router-dom';
import { theme } from '../../../theme/theme';
import { InboxMode } from '../../../types/email';
import { captureEvent } from '../../../utils/posthog';

interface InboxHeaderActionsProps {
  mode: InboxMode;
  nextDeliveryText: string | null;
  hasRunAnalysis: boolean | null;
}

/**
 * Inbox header actions component
 * Displays action buttons and next delivery info
 */
export const InboxHeaderActions: React.FC<InboxHeaderActionsProps> = ({
  mode,
  nextDeliveryText,
  hasRunAnalysis,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const getHelpLink = (): string => {
    if (mode === 'triage') return '/help/triage';
    if (mode === 'action') return '/help/process';
    return '/help/follow-up';
  };

  const getHelpType = (): string => {
    if (mode === 'triage') return 'triage';
    if (mode === 'action') return 'process';
    return 'follow-up';
  };

  return (
    <div style={{ display: 'flex', gap: theme.spacing.md, alignItems: 'center' }}>
      {nextDeliveryText && (
        <span
          style={{
            fontSize: theme.typography.fontSize.base,
            color: theme.colors.text.secondary,
            fontWeight: theme.typography.fontWeight.medium,
          }}
        >
          Next batch: {nextDeliveryText}
        </span>
      )}

      <Link
        to={getHelpLink()}
        onClick={() => {
          captureEvent('help_link_clicked', { help_type: getHelpType() });
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '32px',
          height: '32px',
          borderRadius: '50%',
          backgroundColor: theme.colors.background.subtle,
          color: theme.colors.text.secondary,
          textDecoration: 'none',
          fontSize: theme.typography.fontSize.lg,
          fontWeight: theme.typography.fontWeight.bold,
          transition: theme.transitions.default,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = theme.colors.primary.subtle;
          e.currentTarget.style.color = theme.colors.primary.main;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = theme.colors.background.subtle;
          e.currentTarget.style.color = theme.colors.text.secondary;
        }}
        title={t('help.title')}
      >
        ?
      </Link>

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
        Compose
      </button>

      {hasRunAnalysis === false && (
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
          Analyze Emails
        </button>
      )}
    </div>
  );
};

