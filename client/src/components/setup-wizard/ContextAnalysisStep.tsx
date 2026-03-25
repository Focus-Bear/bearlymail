import React, { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_NAMED_WHITE, COLOR_TRANSPARENT } from 'constants/colors';
import { CONTEXT_ANALYSIS_RECENT_COUNT } from 'constants/numbers';
import { STRING_NONE } from 'constants/strings';
import { useAnalysisProgress } from 'hooks/settings/useAnalysisProgress';

// Static style constants — outside component to avoid recreation on each render
const titleStyle: React.CSSProperties = {
  color: theme.colors.text.primary,
  fontSize: theme.typography.fontSize['2xl'],
  fontWeight: theme.typography.fontWeight.bold,
  marginBottom: theme.spacing.md,
  textAlign: 'center',
};

const subtitleStyle: React.CSSProperties = {
  color: theme.colors.text.secondary,
  fontSize: theme.typography.fontSize.base,
  lineHeight: 1.6,
  marginBottom: theme.spacing.lg,
  textAlign: 'center',
};

const progressCardStyle: React.CSSProperties = {
  backgroundColor: theme.colors.background.subtle,
  borderRadius: theme.borderRadius.md,
  padding: theme.spacing.lg,
  marginBottom: theme.spacing.lg,
};

const errorTextStyle: React.CSSProperties = {
  color: theme.colors.accent.error,
  fontSize: theme.typography.fontSize.base,
  marginBottom: theme.spacing.md,
};

const errorActionsRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: theme.spacing.md,
  justifyContent: 'center',
};

const retryButtonStyle: React.CSSProperties = {
  padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
  backgroundColor: theme.colors.primary.main,
  color: COLOR_NAMED_WHITE,
  border: STRING_NONE,
  borderRadius: theme.borderRadius.md,
  fontSize: theme.typography.fontSize.lg,
  fontWeight: theme.typography.fontWeight.semibold,
  cursor: 'pointer',
};

const skipButtonStyle: React.CSSProperties = {
  padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
  backgroundColor: COLOR_TRANSPARENT,
  color: theme.colors.text.secondary,
  border: `1px solid ${theme.colors.border.medium}`,
  borderRadius: theme.borderRadius.md,
  fontSize: theme.typography.fontSize.lg,
  fontWeight: theme.typography.fontWeight.semibold,
  cursor: 'pointer',
};

const statusRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing.md,
  marginBottom: theme.spacing.md,
};

const spinnerStyle: React.CSSProperties = {
  width: '16px',
  height: '16px',
  border: `2px solid ${theme.colors.primary.main}`,
  borderTop: '2px solid transparent',
  borderRadius: '50%',
  animation: 'spin 1s linear infinite',
};

const statusTextStyle: React.CSSProperties = {
  color: theme.colors.text.primary,
  fontSize: theme.typography.fontSize.base,
  fontWeight: theme.typography.fontWeight.semibold,
};

const progressBarTrackStyle: React.CSSProperties = {
  width: '100%',
  height: '8px',
  backgroundColor: theme.colors.border.light,
  borderRadius: theme.borderRadius.full,
  overflow: 'hidden',
  marginBottom: theme.spacing.sm,
};

const progressLabelStyle: React.CSSProperties = {
  color: theme.colors.text.secondary,
  fontSize: theme.typography.fontSize.lg,
  margin: 0,
  textAlign: 'center',
};

const insightsPanelStyle: React.CSSProperties = {
  marginTop: theme.spacing.md,
  padding: theme.spacing.md,
  backgroundColor: theme.colors.background.paper,
  borderRadius: theme.borderRadius.md,
  maxHeight: '150px',
  overflowY: 'auto',
};

const insightsPanelHeaderStyle: React.CSSProperties = {
  marginBottom: theme.spacing.xs,
  fontWeight: theme.typography.fontWeight.semibold,
  fontSize: theme.typography.fontSize.sm,
  color: theme.colors.text.primary,
};

const insightsListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing.xs,
};

const insightItemStyle: React.CSSProperties = {
  fontSize: theme.typography.fontSize.lg,
  color: theme.colors.text.secondary,
  lineHeight: 1.4,
};

const continueButtonStyle: React.CSSProperties = {
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
};

// Dynamic style helper — depends on runtime progressPercent value
function getProgressBarFillStyle(progressPercent: number): React.CSSProperties {
  return {
    width: `${progressPercent}%`,
    height: '100%',
    backgroundColor: theme.colors.primary.main,
    transition: 'width 0.3s ease',
  };
}

interface ContextAnalysisStepProps {
  onComplete: () => void;
}

export const ContextAnalysisStep: React.FC<ContextAnalysisStepProps> = ({ onComplete }) => {
  const { t } = useTranslation();

  const handleAnalysisComplete = useCallback(async () => {
    onComplete();
  }, [onComplete]);

  const { analyzing, analyzeProgress, startAnalysis } = useAnalysisProgress(
    handleAnalysisComplete,
    { isNewUserOnboarding: true },
  );

  const hasStartedRef = useRef(false);

  useEffect(() => {
    if (!analyzing && !analyzeProgress.isComplete) {
      if (!hasStartedRef.current) {
        hasStartedRef.current = true;
        startAnalysis();
      }
    }
  }, [analyzing, analyzeProgress.isComplete, startAnalysis]);

  const progressPercent = analyzeProgress.progress
    ? Math.round((analyzeProgress.progress.current / analyzeProgress.progress.total) * 100)
    : 0;

  return (
    <div>
      <h2 style={titleStyle}>{t('setupWizard.contextAnalysis.title')}</h2>
      <p style={subtitleStyle}>{t('setupWizard.contextAnalysis.description')}</p>

      <div style={progressCardStyle}>
        {analyzeProgress.error ? (
          <div style={{ textAlign: 'center' }}>
            <p style={errorTextStyle}>{analyzeProgress.error}</p>
            <div style={errorActionsRowStyle}>
              <button onClick={startAnalysis} style={retryButtonStyle}>
                {t('common.retry')}
              </button>
              <button onClick={onComplete} style={skipButtonStyle}>
                {t('setupWizard.contextAnalysis.skip')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div style={statusRowStyle}>
              {!analyzeProgress.isComplete && <div style={spinnerStyle} />}
              <span style={statusTextStyle}>
                {analyzeProgress.isComplete
                  ? t('setupWizard.contextAnalysis.complete')
                  : t('setupWizard.contextAnalysis.analyzing')}
              </span>
            </div>

            <div style={progressBarTrackStyle}>
              <div style={getProgressBarFillStyle(progressPercent)} />
            </div>

            <p style={progressLabelStyle}>
              {analyzeProgress.progress?.messageKey
                ? t(analyzeProgress.progress.messageKey, analyzeProgress.progress.messageValues || {})
                : `${progressPercent}% ${t('setupWizard.contextAnalysis.progressLabel')}`}
            </p>

            {analyzeProgress.progress?.insights && analyzeProgress.progress.insights.length > 0 && (
              <div style={insightsPanelStyle}>
                <div style={insightsPanelHeaderStyle}>{t('settings.analysis.whatWereLearning')}</div>
                <div style={insightsListStyle}>
                  {analyzeProgress.progress.insights
                    .slice(-CONTEXT_ANALYSIS_RECENT_COUNT)
                    .reverse()
                    .map((insight) => (
                      <div key={`${insight.type}-${insight.message}`} style={insightItemStyle}>
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
        <button onClick={onComplete} style={continueButtonStyle}>
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
