/**
 * Shown once the user has cleared Triage and the first sync left older mail behind
 * (`user.syncWindowLimited`): offers to import the next batch of older emails and says how
 * many more the plan's credits cover. Replaces the always-on "we only imported 500" banner,
 * which told users about a limit before it mattered to them.
 */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useVolumeUsage, VolumeUsage } from 'queries/useOrgUsage';
import { theme } from 'theme/theme';

import { API_URL } from 'config/api';
import { EMOJI_INFO } from 'constants/emojis';
import { INITIAL_SYNC_MAX_THREADS } from 'constants/numbers';
import {
  API_ENDPOINT_IMPORT_OLDER_EMAILS,
  IMPORT_OLDER_STATUS,
  ImportOlderStatus,
  SETTINGS_PLANS_ROUTE,
} from 'constants/strings';

export const IMPORT_OLDER_NOTICE_TEST_ID = 'import-older-emails-notice';

interface ImportOlderEmailsResponse {
  status: ImportOlderStatus;
  queuedThreads: number;
}

const REQUEST_STATE = {
  IDLE: 'idle',
  PENDING: 'pending',
  FAILED: 'failed',
} as const;

type RequestState = (typeof REQUEST_STATE)[keyof typeof REQUEST_STATE];

/** Emails the plan can still process this cycle, or null when there is no limit to mention. */
export function getRemainingPlanCredits(usage: VolumeUsage | undefined): number | null {
  if (!usage || usage.selfHosted) {
    return null;
  }
  return Math.max(0, usage.emailLimit - usage.emailsUsed);
}

const linkButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  color: theme.colors.primary.main,
  textDecoration: 'underline',
  font: 'inherit',
};

interface ImportOlderEmailsNoticeProps {
  /** Server flag: the first sync stopped at the most recent INITIAL_SYNC_MAX_THREADS threads. */
  syncWindowLimited?: boolean;
  /** Every Triage thread has been dealt with (across all priorities). */
  isTriageCleared: boolean;
}

export const ImportOlderEmailsNotice: React.FC<ImportOlderEmailsNoticeProps> = ({
  syncWindowLimited,
  isTriageCleared,
}) => {
  const { t } = useTranslation();
  const { data: volumeUsage } = useVolumeUsage();
  const [requestState, setRequestState] = useState<RequestState>(REQUEST_STATE.IDLE);
  const [result, setResult] = useState<ImportOlderEmailsResponse | null>(null);

  if (!syncWindowLimited || !isTriageCleared) {
    return null;
  }

  const importNextBatch = async () => {
    setRequestState(REQUEST_STATE.PENDING);
    try {
      const response = await axios.post<ImportOlderEmailsResponse>(`${API_URL}${API_ENDPOINT_IMPORT_OLDER_EMAILS}`);
      setResult(response.data);
      setRequestState(REQUEST_STATE.IDLE);
    } catch (error: unknown) {
      console.error('Failed to import older emails:', error);
      setRequestState(REQUEST_STATE.FAILED);
    }
  };

  const remainingCredits = getRemainingPlanCredits(volumeUsage);

  const renderBody = () => {
    if (result?.status === IMPORT_OLDER_STATUS.QUEUED) {
      return t('inbox.importOlderNotice.queued', { count: result.queuedThreads });
    }
    if (result?.status === IMPORT_OLDER_STATUS.NOTHING_OLDER) {
      return t('inbox.importOlderNotice.nothingOlder');
    }
    if (result?.status === IMPORT_OLDER_STATUS.UNSUPPORTED) {
      return t('inbox.importOlderNotice.unsupported');
    }
    return (
      <>
        {t('inbox.importOlderNotice.message', { count: INITIAL_SYNC_MAX_THREADS })}{' '}
        <button
          type="button"
          onClick={importNextBatch}
          disabled={requestState === REQUEST_STATE.PENDING}
          style={linkButtonStyle}
        >
          {t('inbox.importOlderNotice.processMore', { count: INITIAL_SYNC_MAX_THREADS })}
        </button>
        {requestState === REQUEST_STATE.FAILED && <> {t('inbox.importOlderNotice.failed')}</>}
        {remainingCredits !== null && (
          <>
            {' '}
            {t('inbox.importOlderNotice.credits', { count: remainingCredits })}{' '}
            <Link to={SETTINGS_PLANS_ROUTE} style={{ color: theme.colors.primary.main }}>
              {t('inbox.importOlderNotice.viewPlans')}
            </Link>
          </>
        )}
      </>
    );
  };

  return (
    <div
      role="status"
      data-testid={IMPORT_OLDER_NOTICE_TEST_ID}
      style={{
        padding: `${theme.spacing.sm} ${theme.spacing.md}`,
        margin: `${theme.spacing.sm} ${theme.spacing.md} 0`,
        backgroundColor: theme.colors.background.subtle,
        border: `1px solid ${theme.colors.border.light}`,
        borderRadius: theme.borderRadius.md,
        fontSize: theme.typography.fontSize.sm,
        color: theme.colors.text.secondary,
      }}
    >
      {EMOJI_INFO} {renderBody()}
    </div>
  );
};
