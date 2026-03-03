import React, { useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { CONTEXT_ANALYSIS_RECENT_COUNT } from 'constants/numbers';
import { useAnalysisProgress } from 'hooks/settings/useAnalysisProgress';
import { COLOR_NAMED_WHITE, COLOR_TRANSPARENT } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

interface ContextAnalysisStepProps {
  onComplete: () => void;
}

export const ContextAnalysisStep: React.FC<ContextAnalysisStepProps> = ({ onComplete }) => {
  const { t } = useTranslation();

  const handleAnalysisComplete = useCallback(async () => {
    onComplete();
  }, [onComplete]);

  const { analyzing, analyzeProgress, startAnalysis } = useAnalysisProgress(handleAnalysisComplete);

  useEffect(() => {
    if (!analyzing && !analyzeProgress.isComplete) {
      startAnalysis();
    }
  }, []);

  const progressPercent = analyzeProgress.progress
    ? Math.round((analyzeProgress.progress.current / analyzeProgress.progress.total) * 100)
    : 0;

  return (
    <div>
      <h2
        style={{
          color: theme.colors.text.primary,
          fontSize: theme.typography.fontSize['2xl'],
          fontWeight: theme.typography.fontWeight.bold,
          marginBottom: theme.spacing.md,
          textAlign: 'center',
        }}
      >
        {t('setupWizard.contextAnalysis.title')}
      </h2>

      <p
        style={{
          color: theme.colors.text.secondary,
          fontSize: theme.typography.fontSize.base,
          lineHeight: 1.6,
          marginBottom: theme.spacing.lg,
          textAlign: 'center',
        }}
      >
        {t('setupWizard.contextAnalysis.description')}
      </p>

      <div
        style={{
          backgroundColor: theme.colors.background.subtle,
          borderRadius: theme.borderRadius.md,
          padding: theme.spacing.lg,
          marginBottom: theme.spacing.lg,
        }}
      >
        {analyzeProgress.error ? (
          <div style={{ textAlign: 'center' }}>
            <p
              style={{
                color: theme.colors.accent.error,
                fontSize: theme.typography.fontSize.base,
                marginBottom: theme.spacing.md,
              }}
            >
              {analyzeProgress.error}
            </p>
            <div style={{ display: 'flex', gap: theme.spacing.md, justifyContent: 'center' }}>
              <button
                onClick={startAnalysis}
                style={{
                  padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
                  backgroundColor: theme.colors.primary.main,
                  color: COLOR_NAMED_WHITE,
                  border: STRING_NONE,
                  borderRadius: theme.borderRadius.md,
                  fontSize: theme.typography.fontSize.sm,
                  fontWeight: theme.typography.fontWeight.semibold,
                  cursor: 'pointer',
                }}
              >
                {t('common.retry')}
              </button>
              <button
                onClick={onComplete}
                style={{
                  padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
                  backgroundColor: COLOR_TRANSPARENT,
                  color: theme.colors.text.secondary,
                  border: `1px solid ${theme.colors.border.medium}`,
                  borderRadius: theme.borderRadius.md,
                  fontSize: theme.typography.fontSize.sm,
                  fontWeight: theme.typography.fontWeight.semibold,
                  cursor: 'pointer',
                }}
              >
                {t('setupWizard.contextAnalysis.skip')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md, marginBottom: theme.spacing.md }}>
              {!analyzeProgress.isComplete && (
                <div
                  style={{
                    width: '16px',
                    height: '16px',
                    border: `2px solid ${theme.colors.primary.main}`,
                    borderTop: '2px solid transparent',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                  }}
                />
              )}
              <span
                style={{
                  color: theme.colors.text.primary,
                  fontSize: theme.typography.fontSize.base,
                  fontWeight: theme.typography.fontWeight.semibold,
                }}
              >
                {analyzeProgress.isComplete
                  ? t('setupWizard.contextAnalysis.complete')
                  : t('setupWizard.contextAnalysis.analyzing')}
              </span>
            </div>

            <div
              style={{
                width: '100%',
                height: '8px',
                backgroundColor: theme.colors.border.light,
                borderRadius: theme.borderRadius.full,
                overflow: 'hidden',
                marginBottom: theme.spacing.sm,
              }}
            >
              <div
                style={{
                  width: `${progressPercent}%`,
                  height: '100%',
                  backgroundColor: theme.colors.primary.main,
                  transition: 'width 0.3s ease',
                }}
              />
            </div>

            <p
              style={{
                color: theme.colors.text.secondary,
                fontSize: theme.typography.fontSize.sm,
                margin: 0,
                textAlign: 'center',
              }}
            >
              {analyzeProgress.progress?.messageKey
                ? t(analyzeProgress.progress.messageKey, analyzeProgress.progress.messageValues || {})
                : `${progressPercent}% ${t('setupWizard.contextAnalysis.progressLabel')}`}
            </p>

            {analyzeProgress.progress?.insights && analyzeProgress.progress.insights.length > 0 && (
              <div
                style={{
                  marginTop: theme.spacing.md,
                  padding: theme.spacing.md,
                  backgroundColor: theme.colors.background.paper,
                  borderRadius: theme.borderRadius.md,
                  maxHeight: '150px',
                  overflowY: 'auto',
                }}
              >
                <div
                  style={{
                    marginBottom: theme.spacing.xs,
                    fontWeight: theme.typography.fontWeight.semibold,
                    fontSize: theme.typography.fontSize.xs,
                    color: theme.colors.text.primary,
                  }}
                >
                  {t('settings.analysis.whatWereLearning')}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xs }}>
                  {analyzeProgress.progress.insights.slice(-CONTEXT_ANALYSIS_RECENT_COUNT).reverse().map((insight) => (
                    <div
                      key={insight}
                      style={{
                        fontSize: theme.typography.fontSize.xs,
                        color: theme.colors.text.secondary,
                        lineHeight: 1.4,
                      }}
                    >
                      {insight.message}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {analyzeProgress.isComplete && (
        <button
          onClick={onComplete}
          style={{
            width: '100%',
            padding: theme.spacing.lg,
            backgroundColor: theme.colors.primary.main,
            color: COLOR_NAMED_WHITE,
            border: STRING_NONE,
            borderRadius: theme.borderRadius.md,
            fontSize: theme.typography.fontSize.base,
            fontWeight: theme.typography.fontWeight.semibold,
            cursor: 'pointer',
            transition: theme.transitions.default,
          }}
        >
          {t('setupWizard.contextAnalysis.continue')}
        </button>
      )}

      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
};
