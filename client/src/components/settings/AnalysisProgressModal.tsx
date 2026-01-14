import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { AnalyzeProgress } from 'hooks/useSettingsData';
import { EMOJI_WARNING } from 'constants/emojis';

interface AnalysisProgressModalProps {
  analyzeProgress: AnalyzeProgress;
  onDismiss: () => void;
}

// eslint-disable-next-line max-lines-per-function -- Analysis progress modal component requires handling multiple progress states and UI elements
export const AnalysisProgressModal: React.FC<AnalysisProgressModalProps> = ({
  analyzeProgress,
  onDismiss,
}) => {
  const { t } = useTranslation();

  if (!analyzeProgress.show) return null;

  return (
    <div style={{
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
      zIndex: 2000,
      border: `1px solid ${analyzeProgress.error ? theme.colors.accent.error : theme.colors.border.light}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: theme.spacing.sm }}>
        <div style={{ flex: 1 }}>
          {analyzeProgress.error ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md, marginBottom: theme.spacing.sm }}>
                <div style={{
                  width: '20px',
                  height: '20px',
                  color: theme.colors.accent.error,
                  fontSize: '20px',
                }}>
                  {/* eslint-disable-next-line i18next/no-literal-string */}
                  {EMOJI_WARNING}
                </div>
                <h3 style={{
                  color: theme.colors.accent.error,
                  fontSize: theme.typography.fontSize.base,
                  fontWeight: theme.typography.fontWeight.semibold,
                  margin: 0,
                }}>
                  {t('settings.analysis.failed')}
                </h3>
              </div>
              <p style={{
                fontSize: theme.typography.fontSize.sm,
                color: theme.colors.text.primary,
                margin: 0,
                lineHeight: 1.5,
              }}>
                {analyzeProgress.error}
              </p>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md, marginBottom: theme.spacing.sm }}>
                {!analyzeProgress.isComplete && (
                  <div style={{
                    width: '12px',
                    height: '12px',
                    border: `2px solid ${theme.colors.primary.main}`,
                    borderTop: '2px solid transparent',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                  }} />
                )}
                <h3 style={{
                  color: theme.colors.text.primary,
                  fontSize: theme.typography.fontSize.base,
                  fontWeight: theme.typography.fontWeight.semibold,
                  margin: 0,
                }}>
                  {analyzeProgress.isComplete ? t('settings.analysis.complete') : t('settings.analyzing')}
                </h3>
              </div>
              {analyzeProgress.progress && (
                <>
                  <div style={{
                    width: '100%',
                    height: '6px',
                    backgroundColor: theme.colors.border.light,
                    borderRadius: theme.borderRadius.full,
                    overflow: 'hidden',
                    marginBottom: theme.spacing.xs,
                  }}>
                    <div style={{
                      width: `${(analyzeProgress.progress.current / analyzeProgress.progress.total) * 100}%`,
                      height: '100%',
                      backgroundColor: theme.colors.primary.main,
                      transition: 'width 0.3s ease',
                    }} />
                  </div>
                  <p style={{
                    fontSize: theme.typography.fontSize.sm,
                    color: theme.colors.text.secondary,
                    margin: 0,
                  }}>
                    {analyzeProgress.progress.messageKey
                      ? t(analyzeProgress.progress.messageKey, analyzeProgress.progress.messageValues || {})
                      : `${analyzeProgress.progress.current}% complete`}
                  </p>
                  {/* Only show insights during analyzing or later stages, not during fetching/starting */}
                  {analyzeProgress.progress.insights && analyzeProgress.progress.insights.length > 0 && 
                   analyzeProgress.progress.messageKey && 
                   (analyzeProgress.progress.messageKey.includes('analyzing') || 
                    analyzeProgress.progress.messageKey.includes('summarizing') || 
                    analyzeProgress.progress.messageKey.includes('complete')) && (
                    <div style={{
                      marginTop: theme.spacing.sm,
                      padding: theme.spacing.sm,
                      backgroundColor: theme.colors.background.subtle,
                      borderRadius: theme.borderRadius.md,
                      maxHeight: '200px',
                      overflowY: 'auto',
                    }}>
                      <div style={{ 
                        marginBottom: theme.spacing.xs, 
                        fontWeight: theme.typography.fontWeight.semibold,
                        fontSize: theme.typography.fontSize.xs,
                        color: theme.colors.text.primary,
                      }}>
                        What we're learning:
                      </div>
                      <div style={{ 
                        display: 'flex', 
                        flexDirection: 'column', 
                        gap: theme.spacing.xs,
                      }}>
                        {analyzeProgress.progress.insights.slice(-7).reverse().map((insight, index) => (
                          <div 
                            key={index}
                            style={{
                              fontSize: theme.typography.fontSize.xs,
                              color: theme.colors.text.secondary,
                              lineHeight: 1.4,
                              padding: `${theme.spacing.xs} 0`,
                              borderBottom: index < analyzeProgress.progress.insights!.slice(-7).reverse().length - 1 
                                ? `1px solid ${theme.colors.border.light}` 
                                : 'none',
                            }}
                          >
                            • {insight.message}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {((analyzeProgress.isComplete || (analyzeProgress.progress && analyzeProgress.progress.current === analyzeProgress.progress.total)) && analyzeProgress.progress?.stats) && (
                    <div style={{
                      fontSize: theme.typography.fontSize.xs,
                      color: theme.colors.text.secondary,
                      margin: `${theme.spacing.sm} 0 0 0`,
                      padding: theme.spacing.sm,
                      backgroundColor: theme.colors.background.subtle,
                      borderRadius: theme.borderRadius.md,
                    }}>
                      <div style={{ marginBottom: theme.spacing.xs, fontWeight: theme.typography.fontWeight.semibold }}>
                        {t('settings.analysis.summary')}:
                      </div>
                      <div style={{ lineHeight: 1.6 }}>
                        <div>• {t('settings.analysis.stats.threadsAnalyzed', { count: analyzeProgress.progress.stats.totalThreads || 0 })}</div>
                        <div>• {t('settings.analysis.stats.outboundAnalyzed', { count: analyzeProgress.progress.stats.outboundEmails || 0 })}</div>
                        <div>• {t('settings.analysis.stats.neverOpened', { count: analyzeProgress.progress.stats.threadsNeverOpened || 0 })}</div>
                        <div>• {t('settings.analysis.stats.readNotReplied', { count: analyzeProgress.progress.stats.threadsReadButNotReplied || 0 })}</div>
                        <div>• {t('settings.analysis.stats.vipContacts', { count: analyzeProgress.progress.stats.vipContactsEvaluated || 0 })}</div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
        <button
          onClick={onDismiss}
          style={{
            background: 'none',
            border: 'none',
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


