import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { EMOJI_WARNING } from 'constants/emojis';
import { ANALYSIS_RECENT_INSIGHTS_COUNT, Z_INDEX_POPUP } from 'constants/numbers';
import { STRING_NONE } from 'constants/strings';
import { AnalyzeProgress } from 'hooks/useSettingsData';

import { shouldShowInsights } from './analysisProgressModal.helpers';

interface AnalysisProgressModalProps {
  analyzeProgress: AnalyzeProgress;
  onDismiss: () => void;
}

interface StatItem {
  label: string;
  count: number;
}

interface ProgressSummaryPanelProps {
  stats: NonNullable<NonNullable<AnalyzeProgress['progress']>['stats']>;
}

const ProgressSummaryPanel: React.FC<ProgressSummaryPanelProps> = ({ stats }) => {
  const { t } = useTranslation();
  const items: StatItem[] = [
    {
      label: t('settings.analysis.stats.threadsAnalyzed', { count: stats.totalThreads ?? 0 }),
      count: stats.totalThreads ?? 0,
    },
    {
      label: t('settings.analysis.stats.outboundAnalyzed', { count: stats.outboundEmails ?? 0 }),
      count: stats.outboundEmails ?? 0,
    },
    {
      label: t('settings.analysis.stats.neverOpened', { count: stats.threadsNeverOpened ?? 0 }),
      count: stats.threadsNeverOpened ?? 0,
    },
    {
      label: t('settings.analysis.stats.readNotReplied', { count: stats.threadsReadButNotReplied ?? 0 }),
      count: stats.threadsReadButNotReplied ?? 0,
    },
    {
      label: t('settings.analysis.stats.vipContacts', { count: stats.vipContactsEvaluated ?? 0 }),
      count: stats.vipContactsEvaluated ?? 0,
    },
  ];
  return (
    <div
      style={{
        fontSize: theme.typography.fontSize.xs,
        color: theme.colors.text.secondary,
        margin: `${theme.spacing.sm} 0 0 0`,
        padding: theme.spacing.sm,
        backgroundColor: theme.colors.background.subtle,
        borderRadius: theme.borderRadius.md,
      }}
    >
      <div style={{ marginBottom: theme.spacing.xs, fontWeight: theme.typography.fontWeight.semibold }}>
        {t('settings.analysis.summary')}:
      </div>
      <div style={{ lineHeight: 1.6 }}>
        {items.map(item => (
          <div key={item.label}>• {item.label}</div>
        ))}
      </div>
    </div>
  );
};

interface ProgressInsightsPanelProps {
  insights: Array<{ message: string }>;
}

const ProgressInsightsPanel: React.FC<ProgressInsightsPanelProps> = ({ insights }) => {
  const { t } = useTranslation();
  const recentInsights = insights.slice(-ANALYSIS_RECENT_INSIGHTS_COUNT).reverse();
  return (
    <div
      style={{
        marginTop: theme.spacing.sm,
        padding: theme.spacing.sm,
        backgroundColor: theme.colors.background.subtle,
        borderRadius: theme.borderRadius.md,
        maxHeight: '200px',
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
        {recentInsights.map((insight, idx) => (
          <div
            key={insight.message}
            style={{
              fontSize: theme.typography.fontSize.xs,
              color: theme.colors.text.secondary,
              lineHeight: 1.4,
              padding: `${theme.spacing.xs} 0`,
              borderBottom: idx < recentInsights.length - 1 ? `1px solid ${theme.colors.border.light}` : STRING_NONE,
            }}
          >
            • {insight.message}
          </div>
        ))}
      </div>
    </div>
  );
};

export const AnalysisProgressModal: React.FC<AnalysisProgressModalProps> = ({ analyzeProgress, onDismiss }) => {
  const { t } = useTranslation();

  if (!analyzeProgress.show) {
    return null;
  }

  const { error, isComplete, progress } = analyzeProgress;
  const isProgressComplete = isComplete || progress?.current === progress?.total;

  return (
    <div
      style={{
        position: 'fixed',
        top: '120px',
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: theme.colors.background.paper,
        padding: theme.spacing.lg,
        borderRadius: theme.borderRadius.lg,
        boxShadow: theme.shadows.xl,
        minWidth: '300px',
        maxWidth: '500px',
        zIndex: Z_INDEX_POPUP,
        border: `1px solid ${error ? theme.colors.accent.error : theme.colors.border.light}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: theme.spacing.sm,
        }}
      >
        <div style={{ flex: 1 }}>
          {error ? (
            <>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md, marginBottom: theme.spacing.sm }}
              >
                <div style={{ width: '20px', height: '20px', color: theme.colors.accent.error, fontSize: '20px' }}>
                  {EMOJI_WARNING}
                </div>
                <h3
                  style={{
                    color: theme.colors.accent.error,
                    fontSize: theme.typography.fontSize.base,
                    fontWeight: theme.typography.fontWeight.semibold,
                    margin: 0,
                  }}
                >
                  {t('settings.analysis.failed')}
                </h3>
              </div>
              <p
                style={{
                  fontSize: theme.typography.fontSize.sm,
                  color: theme.colors.text.primary,
                  margin: 0,
                  lineHeight: 1.5,
                }}
              >
                {error}
              </p>
            </>
          ) : (
            <>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md, marginBottom: theme.spacing.sm }}
              >
                {!isComplete && (
                  <div
                    style={{
                      width: '12px',
                      height: '12px',
                      border: `2px solid ${theme.colors.primary.main}`,
                      borderTop: '2px solid transparent',
                      borderRadius: '50%',
                      animation: 'spin 1s linear infinite',
                    }}
                  />
                )}
                <h3
                  style={{
                    color: theme.colors.text.primary,
                    fontSize: theme.typography.fontSize.base,
                    fontWeight: theme.typography.fontWeight.semibold,
                    margin: 0,
                  }}
                >
                  {isComplete ? t('settings.analysis.complete') : t('settings.analyzing')}
                </h3>
              </div>
              {progress && (
                <>
                  <div
                    style={{
                      width: '100%',
                      height: '6px',
                      backgroundColor: theme.colors.border.light,
                      borderRadius: theme.borderRadius.full,
                      overflow: 'hidden',
                      marginBottom: theme.spacing.xs,
                    }}
                  >
                    <div
                      style={{
                        width: `${(progress.current / progress.total) * 100}%`,
                        height: '100%',
                        backgroundColor: theme.colors.primary.main,
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                  <p style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary, margin: 0 }}>
                    {progress.messageKey
                      ? t(progress.messageKey, progress.messageValues ?? {})
                      : `${progress.current}% complete`}
                  </p>
                  {progress.insights && shouldShowInsights(progress.messageKey) && (
                    <ProgressInsightsPanel insights={progress.insights} />
                  )}
                  {isProgressComplete && progress.stats && <ProgressSummaryPanel stats={progress.stats} />}
                </>
              )}
            </>
          )}
        </div>
        <button
          onClick={onDismiss}
          style={{
            background: STRING_NONE,
            border: STRING_NONE,
            fontSize: '20px',
            color: theme.colors.text.secondary,
            cursor: 'pointer',
            padding: '0',
            marginLeft: theme.spacing.md,
            lineHeight: 1,
          }}
          aria-label="Close"
        >
          ×
        </button>
      </div>
    </div>
  );
};
