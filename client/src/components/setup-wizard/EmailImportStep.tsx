import React, { useCallback, useEffect, useRef,useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';

import { API_URL } from 'config/api';
import { COLOR_NAMED_WHITE } from 'constants/colors';
import { POLLING_INTERVAL_MS } from 'constants/numbers';
import { STRING_NONE } from 'constants/strings';

interface EmailImportStepProps {
  onComplete: () => void;
  isLoading: boolean;
}

interface ImportProgress { prioritizedCount: number; isReady: boolean; }

const TARGET_EMAILS = 100;

const EmailImportContent: React.FC<{ progress: ImportProgress; progressPercent: number; error: string | null; fetchProgress: () => Promise<void>; isLoading: boolean; onComplete: () => void; t: (k: string) => string; }> = ({ progress, progressPercent, error, fetchProgress, isLoading, onComplete, t }) => {
  return (
    <div>
      <h2 style={{ color: theme.colors.text.primary, fontSize: theme.typography.fontSize['2xl'], fontWeight: theme.typography.fontWeight.bold, marginBottom: theme.spacing.md, textAlign: 'center' }}>
        {t('setupWizard.emailImport.title')}
      </h2>

      <p style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.base, lineHeight: 1.6, marginBottom: theme.spacing.lg, textAlign: 'center' }}>
        {progress.isReady ? t('setupWizard.emailImport.readyDescription') : t('setupWizard.emailImport.description')}
      </p>

      <div style={{ backgroundColor: theme.colors.background.subtle, borderRadius: theme.borderRadius.md, padding: theme.spacing.lg, marginBottom: theme.spacing.lg }}>
        {error ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: theme.colors.accent.error, fontSize: theme.typography.fontSize.base, marginBottom: theme.spacing.md }}>{error}</p>
            <button onClick={fetchProgress} style={{ padding: `${theme.spacing.sm} ${theme.spacing.lg}`, backgroundColor: theme.colors.primary.main, color: COLOR_NAMED_WHITE, border: STRING_NONE, borderRadius: theme.borderRadius.md, fontSize: theme.typography.fontSize.sm, fontWeight: theme.typography.fontWeight.semibold, cursor: 'pointer' }}>{t('common.retry')}</button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md, marginBottom: theme.spacing.md }}>
              {!progress.isReady && (
                <div style={{ width: '16px', height: '16px', border: `2px solid ${theme.colors.primary.main}`, borderTop: '2px solid transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              )}
              <span style={{ color: theme.colors.text.primary, fontSize: theme.typography.fontSize.base, fontWeight: theme.typography.fontWeight.semibold }}>
                {progress.isReady ? t('setupWizard.emailImport.ready') : t('setupWizard.emailImport.importing')}
              </span>
            </div>

            <div style={{ width: '100%', height: '8px', backgroundColor: theme.colors.border.light, borderRadius: theme.borderRadius.full, overflow: 'hidden', marginBottom: theme.spacing.sm }}>
              <div style={{ width: `${progressPercent}%`, height: '100%', backgroundColor: progress.isReady ? theme.colors.accent.success : theme.colors.primary.main, transition: 'width 0.3s ease' }} />
            </div>

            <p style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm, margin: 0, textAlign: 'center' }}>{t('setupWizard.emailImport.progressCount', { count: progress.prioritizedCount })}</p>
          </>
        )}
      </div>

      <button onClick={onComplete} disabled={!progress.isReady || isLoading} style={{ width: '100%', padding: theme.spacing.lg, backgroundColor: progress.isReady ? theme.colors.primary.main : theme.colors.border.light, color: progress.isReady ? 'white' : theme.colors.text.disabled, border: STRING_NONE, borderRadius: theme.borderRadius.md, fontSize: theme.typography.fontSize.base, fontWeight: theme.typography.fontWeight.semibold, cursor: progress.isReady ? 'pointer' : 'not-allowed', transition: theme.transitions.default }}>
        {isLoading ? t('common.loading') : t('setupWizard.emailImport.enterInbox')}
      </button>

      {!progress.isReady && <p style={{ color: theme.colors.text.tertiary, fontSize: theme.typography.fontSize.xs, textAlign: 'center', marginTop: theme.spacing.md }}>{t('setupWizard.emailImport.backgroundNote')}</p>}

      <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export const EmailImportStep: React.FC<EmailImportStepProps> = ({ onComplete, isLoading }) => {
  const { t } = useTranslation();
  const [progress, setProgress] = useState<ImportProgress>({ prioritizedCount: 0, isReady: false });
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const hasCalledComplete = useRef(false);

  const fetchProgress = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/onboarding/email-import-progress`);
      setProgress(response.data);
      setError(null);

      if (response.data.isReady && !hasCalledComplete.current) {
        hasCalledComplete.current = true;
        if (pollingRef.current) {
          clearTimeout(pollingRef.current);
          pollingRef.current = null;
        }
      }
    } catch (err) {
      console.error('Failed to fetch email import progress:', err);
      setError(t('setupWizard.emailImport.error'));
    }
  }, [t]);

  useEffect(() => {
    fetchProgress();

    const poll = () => {
      pollingRef.current = setTimeout(async () => {
        await fetchProgress();
        if (!hasCalledComplete.current) {
          poll();
        }
      }, POLLING_INTERVAL_MS);
    };

    poll();

  }, [fetchProgress]);

  const progressPercent = Math.min(100, Math.round((progress.prioritizedCount / TARGET_EMAILS) * 100));

  return <EmailImportContent progress={progress} progressPercent={progressPercent} error={error} fetchProgress={fetchProgress} isLoading={isLoading} onComplete={onComplete} t={t} />;
};
