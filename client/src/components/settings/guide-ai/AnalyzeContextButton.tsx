import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';

interface AnalyzeContextButtonProps {
  analyzing: boolean;
  onAnalyzeContext: () => Promise<void>;
}

export const AnalyzeContextButton: React.FC<AnalyzeContextButtonProps> = ({ analyzing, onAnalyzeContext }) => {
  const { t } = useTranslation();

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: theme.spacing.sm }}>
      <button
        onClick={() => {
          captureEvent(ANALYTICS_EVENTS.ANALYZE_CONTEXT_CLICKED);
          onAnalyzeContext();
        }}
        disabled={analyzing}
        style={{
          padding: `${theme.spacing.sm} ${theme.spacing.md}`,
          backgroundColor: analyzing ? theme.colors.background.subtle : theme.colors.secondary.main,
          color: analyzing ? theme.colors.text.secondary : 'white',
          border: analyzing ? `1px solid ${theme.colors.border.medium}` : 'none',
          borderRadius: theme.borderRadius.md,
          cursor: analyzing ? 'wait' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.sm,
        }}
      >
        {analyzing && (
          <div
            style={{
              width: '16px',
              height: '16px',
              border: `2px solid ${theme.colors.text.secondary}`,
              borderTop: '2px solid transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }}
          />
        )}
        {analyzing ? t('settings.analyzing') : t('settings.analyzeEmails')}
      </button>
    </div>
  );
};
