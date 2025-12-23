import React, { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, Link } from 'react-router-dom';
import { theme } from '../../theme/theme';
import { InboxMode } from '../../types/email';
import { captureEvent } from '../../utils/posthog';

interface InboxHeaderProps {
  mode: InboxMode;
  setMode: (mode: InboxMode) => void;
  loadingModeSwitch: boolean;
  nextDelivery: Date | null;
  hasRunAnalysis: boolean | null;
  triageTabRef: RefObject<HTMLButtonElement | null>;
  actionTabRef: RefObject<HTMLButtonElement | null>;
  followUpTabRef: RefObject<HTMLButtonElement | null>;
}

export const InboxHeader: React.FC<InboxHeaderProps> = ({
  mode,
  setMode,
  loadingModeSwitch,
  nextDelivery,
  hasRunAnalysis,
  triageTabRef,
  actionTabRef,
  followUpTabRef,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const getNextDeliveryText = () => {
    if (!nextDelivery) return null;
    const now = new Date();
    const diffMs = nextDelivery.getTime() - now.getTime();
    const diffMins = Math.round(diffMs / (1000 * 60));
    if (diffMins <= 0) return null;

    const diffHours = Math.floor(diffMins / 60);
    const remainingMins = diffMins % 60;
    return diffMins < 60
      ? `${diffMins}m`
      : remainingMins === 0
        ? `${diffHours}h`
        : `${diffHours}h ${remainingMins}m`;
  };

  const nextDeliveryText = getNextDeliveryText();

  return (
    <header style={{
      padding: `${theme.spacing.lg} ${theme.spacing['2xl']}`,
      backgroundColor: theme.colors.background.paper,
      borderBottom: `1px solid ${theme.colors.border.light}`,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    }}>
      <div>
        <h1 style={{
          color: theme.colors.text.primary,
          fontSize: theme.typography.fontSize['2xl'],
          fontWeight: theme.typography.fontWeight.bold,
          marginBottom: theme.spacing.xs,
        }}>
          {t('inbox.title')}
        </h1>
        <div style={{ display: 'flex', gap: theme.spacing.md, alignItems: 'center', marginTop: theme.spacing.sm }}>
          <div style={{ display: 'flex', gap: theme.spacing.md }}>
            <button
              ref={triageTabRef}
              className="triage-tab"
              onClick={() => {
                if (mode !== 'triage') {
                  captureEvent('inbox_mode_changed', {
                    from_mode: mode,
                    to_mode: 'triage',
                  });
                  setMode('triage');
                }
              }}
              disabled={loadingModeSwitch}
              style={{
                padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
                backgroundColor: mode === 'triage' ? theme.colors.primary.subtle : 'transparent',
                color: mode === 'triage' ? theme.colors.primary.main : theme.colors.text.secondary,
                border: 'none',
                borderRadius: theme.borderRadius.full,
                cursor: loadingModeSwitch ? 'wait' : 'pointer',
                fontWeight: theme.typography.fontWeight.semibold,
                fontSize: theme.typography.fontSize.base,
                opacity: loadingModeSwitch ? 0.6 : 1,
              }}
            >
              {loadingModeSwitch && mode === 'triage' ? 'Loading...' : t('inbox.triageTab')}
            </button>
            <button
              ref={actionTabRef}
              className="action-tab"
              onClick={() => {
                if (mode !== 'action') {
                  captureEvent('inbox_mode_changed', {
                    from_mode: mode,
                    to_mode: 'action',
                  });
                  setMode('action');
                }
              }}
              disabled={loadingModeSwitch}
              style={{
                padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
                backgroundColor: mode === 'action' ? theme.colors.primary.subtle : 'transparent',
                color: mode === 'action' ? theme.colors.primary.main : theme.colors.text.secondary,
                border: 'none',
                borderRadius: theme.borderRadius.full,
                cursor: loadingModeSwitch ? 'wait' : 'pointer',
                fontWeight: theme.typography.fontWeight.semibold,
                fontSize: theme.typography.fontSize.base,
                opacity: loadingModeSwitch ? 0.6 : 1,
              }}
            >
              {loadingModeSwitch && mode === 'action' ? 'Loading...' : t('inbox.actionTab')}
            </button>
            <button
              ref={followUpTabRef}
              className="follow-up-tab"
              onClick={() => {
                if (mode !== 'follow-up') {
                  captureEvent('inbox_mode_changed', {
                    from_mode: mode,
                    to_mode: 'follow-up',
                  });
                  setMode('follow-up');
                }
              }}
              disabled={loadingModeSwitch}
              style={{
                padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
                backgroundColor: mode === 'follow-up' ? theme.colors.primary.subtle : 'transparent',
                color: mode === 'follow-up' ? theme.colors.primary.main : theme.colors.text.secondary,
                border: 'none',
                borderRadius: theme.borderRadius.full,
                cursor: loadingModeSwitch ? 'wait' : 'pointer',
                fontWeight: theme.typography.fontWeight.semibold,
                fontSize: theme.typography.fontSize.base,
                opacity: loadingModeSwitch ? 0.6 : 1,
              }}
            >
              {loadingModeSwitch && mode === 'follow-up' ? 'Loading...' : t('inbox.followUpTab')}
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: theme.spacing.md, alignItems: 'center' }}>
        {nextDeliveryText && (
          <span style={{
            fontSize: theme.typography.fontSize.base,
            color: theme.colors.text.secondary,
            fontWeight: theme.typography.fontWeight.medium,
          }}>
            Next batch: {nextDeliveryText}
          </span>
        )}

        <Link
          to={mode === 'triage' ? '/help/triage' : mode === 'action' ? '/help/process' : '/help/follow-up'}
          onClick={() => {
            const helpType = mode === 'triage' ? 'triage' : mode === 'action' ? 'process' : 'follow-up';
            captureEvent('help_link_clicked', { help_type: helpType });
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
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.colors.secondary.dark}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = theme.colors.secondary.main}
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
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.colors.button.primary.hover}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = theme.colors.accent.info}
          >
            Analyze Emails
          </button>
        )}
      </div>
    </header>
  );
};




