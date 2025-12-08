import React, { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from '../../theme/theme';

interface InboxHeaderProps {
  mode: 'triage' | 'process';
  onModeChange: (mode: 'triage' | 'process') => void;
  nextDelivery: Date | null;
  refreshing: boolean;
  onCheckUrgent: () => void;
  triageTabRef: RefObject<HTMLButtonElement>;
  processTabRef: RefObject<HTMLButtonElement>;
  deliverBtnRef: RefObject<HTMLButtonElement>;
}

export const InboxHeader: React.FC<InboxHeaderProps> = ({
  mode,
  onModeChange,
  nextDelivery,
  refreshing,
  onCheckUrgent,
  triageTabRef,
  processTabRef,
  deliverBtnRef,
}) => {
  const { t } = useTranslation();

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
        <div style={{ display: 'flex', gap: theme.spacing.md, marginTop: theme.spacing.sm }}>
          <button
            ref={triageTabRef}
            className="triage-tab"
            onClick={() => onModeChange('triage')}
            style={{
              padding: `${theme.spacing.xs} ${theme.spacing.md}`,
              backgroundColor: mode === 'triage' ? theme.colors.primary.subtle : 'transparent',
              color: mode === 'triage' ? theme.colors.primary.main : theme.colors.text.secondary,
              border: 'none',
              borderRadius: theme.borderRadius.full,
              cursor: 'pointer',
              fontWeight: theme.typography.fontWeight.medium,
              fontSize: theme.typography.fontSize.sm,
            }}
          >
            {t('inbox.triageTab')}
          </button>
          <button
            ref={processTabRef}
            className="process-tab"
            onClick={() => onModeChange('process')}
            style={{
              padding: `${theme.spacing.xs} ${theme.spacing.md}`,
              backgroundColor: mode === 'process' ? theme.colors.primary.subtle : 'transparent',
              color: mode === 'process' ? theme.colors.primary.main : theme.colors.text.secondary,
              border: 'none',
              borderRadius: theme.borderRadius.full,
              cursor: 'pointer',
              fontWeight: theme.typography.fontWeight.medium,
              fontSize: theme.typography.fontSize.sm,
            }}
          >
            {t('inbox.processTab')}
          </button>
        </div>
      </div>
      
      <div style={{ display: 'flex', gap: theme.spacing.md, alignItems: 'center' }}>
        {nextDelivery && (
          <div style={{
            fontSize: theme.typography.fontSize.sm,
            color: theme.colors.text.secondary,
            backgroundColor: theme.colors.background.subtle,
            padding: `${theme.spacing.xs} ${theme.spacing.md}`,
            borderRadius: theme.borderRadius.full,
            border: `1px solid ${theme.colors.border.medium}`,
          }}>
            {t('inbox.nextDelivery', { time: nextDelivery.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })}
          </div>
        )}

        <button
          ref={deliverBtnRef}
          className="deliver-btn"
          onClick={onCheckUrgent}
          disabled={refreshing}
          style={{
            padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
            backgroundColor: theme.colors.primary.main,
            color: 'white',
            border: 'none',
            borderRadius: theme.borderRadius.full,
            cursor: refreshing ? 'wait' : 'pointer',
            fontSize: theme.typography.fontSize.sm,
            fontWeight: theme.typography.fontWeight.medium,
            boxShadow: theme.shadows.sm,
            display: 'flex',
            alignItems: 'center',
            gap: theme.spacing.sm,
            opacity: refreshing ? 0.7 : 1,
            transition: theme.transitions.fast,
          }}
          onMouseEnter={(e) => !refreshing && (e.currentTarget.style.backgroundColor = theme.colors.primary.dark)}
          onMouseLeave={(e) => !refreshing && (e.currentTarget.style.backgroundColor = theme.colors.primary.main)}
        >
          {refreshing ? t('inbox.checkingUrgent') : t('inbox.checkUrgent')}
        </button>
      </div>
    </header>
  );
};






