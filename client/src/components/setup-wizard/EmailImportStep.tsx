import React, { useCallback, useEffect, useRef, useState } from 'react';
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

interface ImportProgress {
  prioritizedCount: number;
  isReady: boolean;
}

const TARGET_EMAILS = 100;
// Separate constant for the 0–100 progress percentage scale.
// TARGET_EMAILS happens to equal 100 too, but they mean different things:
// TARGET_EMAILS = the email count goal; PROGRESS_COMPLETE_PERCENT = the 100% bar value.
const PROGRESS_COMPLETE_PERCENT = 100;
const IMPORT_TIMEOUT_MINUTES = 5;
const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;
const IMPORT_TIMEOUT_MS = IMPORT_TIMEOUT_MINUTES * SECONDS_PER_MINUTE * MS_PER_SECOND;
// Cap progress at 99% until isReady — prevents the bar hitting 100% before the backend confirms
const PROGRESS_MAX_BEFORE_READY = 99;

const TimeoutMessage: React.FC<{ t: (k: string) => string }> = ({ t }) => (
  <p
    style={{
      color: theme.colors.text.tertiary,
      fontSize: theme.typography.fontSize.xs,
      textAlign: 'center',
      marginTop: theme.spacing.sm,
    }}
  >
    {t('setupWizard.emailImport.timeoutMessage')}
  </p>
);

interface ImportStatusCardProps {
  progress: ImportProgress;
  progressPercent: number;
  error: string | null;
  fetchProgress: () => Promise<void>;
  timedOut: boolean;
  t: (k: string, options?: Record<string, unknown>) => string;
}

const ImportStatusCard: React.FC<ImportStatusCardProps> = ({
  progress,
  progressPercent,
  error,
  fetchProgress,
  timedOut,
  t,
}) => (
  <div
    style={{
      backgroundColor: theme.colors.background.subtle,
      borderRadius: theme.borderRadius.md,
      padding: theme.spacing.lg,
      marginBottom: theme.spacing.lg,
    }}
  >
    {error ? (
      <div style={{ textAlign: 'center' }}>
        <p
          style={{
            color: theme.colors.accent.error,
            fontSize: theme.typography.fontSize.base,
            marginBottom: theme.spacing.md,
          }}
        >
          {error}
        </p>
        <button
          onClick={fetchProgress}
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
      </div>
    ) : (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md, marginBottom: theme.spacing.md }}>
          {!progress.isReady && (
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
            {progress.isReady ? t('setupWizard.emailImport.ready') : t('setupWizard.emailImport.importing')}
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
              backgroundColor: progress.isReady ? theme.colors.accent.success : theme.colors.primary.main,
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
          {t('setupWizard.emailImport.progressCount', { count: progress.prioritizedCount })}
        </p>

        {timedOut && !progress.isReady && <TimeoutMessage t={t} />}
      </>
    )}
  </div>
);

interface EmailImportContentProps {
  progress: ImportProgress;
  progressPercent: number;
  error: string | null;
  fetchProgress: () => Promise<void>;
  isLoading: boolean;
  onComplete: () => void;
  timedOut: boolean;
  t: (k: string, options?: Record<string, unknown>) => string;
}

const EmailImportContent: React.FC<EmailImportContentProps> = ({
  progress,
  progressPercent,
  error,
  fetchProgress,
  isLoading,
  onComplete,
  timedOut,
  t,
}) => (
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
      {t('setupWizard.emailImport.title')}
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
      {progress.isReady ? t('setupWizard.emailImport.readyDescription') : t('setupWizard.emailImport.description')}
    </p>

    <ImportStatusCard
      progress={progress}
      progressPercent={progressPercent}
      error={error}
      fetchProgress={fetchProgress}
      timedOut={timedOut}
      t={t}
    />

    <button
      onClick={onComplete}
      disabled={(!progress.isReady && !timedOut) || isLoading}
      style={{
        width: '100%',
        padding: theme.spacing.lg,
        backgroundColor: progress.isReady || timedOut ? theme.colors.primary.main : theme.colors.border.light,
        color: progress.isReady || timedOut ? 'white' : theme.colors.text.disabled,
        border: STRING_NONE,
        borderRadius: theme.borderRadius.md,
        fontSize: theme.typography.fontSize.base,
        fontWeight: theme.typography.fontWeight.semibold,
        cursor: progress.isReady || timedOut ? 'pointer' : 'not-allowed',
        transition: theme.transitions.default,
      }}
    >
      {isLoading ? t('common.loading') : t('setupWizard.emailImport.enterInbox')}
    </button>

    {!progress.isReady && !timedOut && (
      <p
        style={{
          color: theme.colors.text.tertiary,
          fontSize: theme.typography.fontSize.xs,
          textAlign: 'center',
          marginTop: theme.spacing.md,
        }}
      >
        {t('setupWizard.emailImport.backgroundNote')}
      </p>
    )}

    <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
  </div>
);

export const EmailImportStep: React.FC<EmailImportStepProps> = ({ onComplete, isLoading }) => {
  const { t } = useTranslation();
  const [progress, setProgress] = useState<ImportProgress>({ prioritizedCount: 0, isReady: false });
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  // Safety valve: if isReady hasn't flipped after 5 minutes, unblock the user anyway
  useEffect(() => {
    const timeoutId = setTimeout(() => setTimedOut(true), IMPORT_TIMEOUT_MS);
    return () => clearTimeout(timeoutId);
  }, []);

  // Show 100% when ready; otherwise cap at PROGRESS_MAX_BEFORE_READY so it doesn't look complete prematurely
  const progressPercent = progress.isReady
    ? PROGRESS_COMPLETE_PERCENT
    : Math.min(
        PROGRESS_MAX_BEFORE_READY,
        Math.round((progress.prioritizedCount / TARGET_EMAILS) * PROGRESS_COMPLETE_PERCENT)
      );

  return (
    <EmailImportContent
      progress={progress}
      progressPercent={progressPercent}
      error={error}
      fetchProgress={fetchProgress}
      isLoading={isLoading}
      onComplete={onComplete}
      timedOut={timedOut}
      t={t}
    />
  );
};
