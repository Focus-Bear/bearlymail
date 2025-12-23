import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from '../../theme/theme';
import { captureEvent } from '../../utils/posthog';

interface FollowUpActionsProps {
  onGenerateDrafts: () => void;
  isGenerating: boolean;
  error: string | null;
  onRetry?: () => void;
}

export const FollowUpActions: React.FC<FollowUpActionsProps> = ({
  onGenerateDrafts,
  isGenerating,
  error,
  onRetry,
}) => {
  const { t } = useTranslation();

  return (
    <div style={{
      padding: theme.spacing.lg,
      backgroundColor: theme.colors.background.paper,
      borderRadius: theme.borderRadius.lg,
      marginBottom: theme.spacing.md,
      border: `1px solid ${theme.colors.border.light}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{
            margin: 0,
            marginBottom: theme.spacing.xs,
            fontSize: theme.typography.fontSize.lg,
            fontWeight: theme.typography.fontWeight.semibold,
            color: theme.colors.text.primary,
          }}>
            {t('inbox.generateFollowUps')}
          </h3>
          <p style={{
            margin: 0,
            fontSize: theme.typography.fontSize.sm,
            color: theme.colors.text.secondary,
          }}>
            {t('inbox.generateFollowUpsDescription')}
          </p>
        </div>
        <button
          onClick={() => {
            captureEvent('bulk_followups_generate_clicked');
            onGenerateDrafts();
          }}
          disabled={isGenerating}
          style={{
            padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
            backgroundColor: isGenerating ? theme.colors.background.disabled : theme.colors.primary.main,
            color: theme.colors.background.paper,
            border: 'none',
            borderRadius: theme.borderRadius.md,
            cursor: isGenerating ? 'wait' : 'pointer',
            fontSize: theme.typography.fontSize.base,
            fontWeight: theme.typography.fontWeight.medium,
            transition: theme.transitions.default,
            opacity: isGenerating ? 0.6 : 1,
          }}
          onMouseEnter={(e) => {
            if (!isGenerating) {
              e.currentTarget.style.backgroundColor = theme.colors.primary.dark;
            }
          }}
          onMouseLeave={(e) => {
            if (!isGenerating) {
              e.currentTarget.style.backgroundColor = theme.colors.primary.main;
            }
          }}
        >
          {isGenerating ? t('inbox.generating') : t('inbox.generateFollowUps')}
        </button>
      </div>
      
      {error && (
        <div style={{
          marginTop: theme.spacing.md,
          padding: theme.spacing.md,
          backgroundColor: theme.colors.error.light,
          borderRadius: theme.borderRadius.md,
          color: theme.colors.error.main,
          fontSize: theme.typography.fontSize.sm,
        }}>
          {error}
          {onRetry && (
            <button
              onClick={() => {
                captureEvent('bulk_followups_generate_retry_clicked');
                onRetry?.();
              }}
              style={{
                marginLeft: theme.spacing.md,
                padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                backgroundColor: 'transparent',
                color: theme.colors.error.main,
                border: `1px solid ${theme.colors.error.main}`,
                borderRadius: theme.borderRadius.sm,
                cursor: 'pointer',
                fontSize: theme.typography.fontSize.sm,
              }}
            >
              {t('common.retry')}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

