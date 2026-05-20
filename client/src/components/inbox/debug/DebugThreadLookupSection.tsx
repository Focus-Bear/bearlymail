import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import {
  COLOR_BG_NEUTRAL,
  COLOR_BG_WARNING,
  COLOR_ERROR_DARK,
  COLOR_GREY_MED,
  COLOR_INFO_VIOLET,
  COLOR_NAMED_WHITE,
  COLOR_SUCCESS_DARK,
  COLOR_WARNING_DARK,
  COLOR_WHITE,
} from 'constants/colors';
import { EMOJI_SEARCH } from 'constants/emojis';
import { OPACITY_DISABLED, OPACITY_FULL } from 'constants/numbers';
import { STRING_NONE } from 'constants/strings';
import { ThreadLookupResult } from 'hooks/useDebugPanel';

interface DebugThreadLookupSectionProps {
  threadLookupResult: ThreadLookupResult | null;
  loadingThreadLookup: boolean;
  onLookupThread: (threadId: string) => void;
}

interface VisibilityPanelProps {
  visibility: {
    wouldShowInTriage: boolean;
    wouldShowInAction: boolean;
    wouldShowInFollowUp: boolean;
  };
}

const VisibilityPanel: React.FC<VisibilityPanelProps> = ({ visibility }) => {
  const { t } = useTranslation();
  const yesColor = '#2E7D32';
  const noColor = '#C62828';
  const items = [
    { key: 'triage', label: 'Triage', value: visibility.wouldShowInTriage },
    { key: 'action', label: 'Action', value: visibility.wouldShowInAction },
    { key: 'followup', label: 'Follow-up', value: visibility.wouldShowInFollowUp },
  ];
  return (
    <div style={{ marginBottom: theme.spacing.md }}>
      <strong>{t('debug.threadLookup.visibility')}:</strong>
      <ul style={{ margin: `${theme.spacing.xs} 0 0 0`, paddingLeft: theme.spacing.lg }}>
        {items.map(item => (
          <li key={item.key} style={{ color: item.value ? yesColor : noColor }}>
            {item.label}: {item.value ? 'Yes' : 'No'}
          </li>
        ))}
      </ul>
    </div>
  );
};

interface GmailApiResult {
  foundInGmailApi: boolean;
  apiThreadId?: string | null;
  apiMessageId?: string | null;
  subject?: string | null;
  from?: string | null;
  receivedAt?: string | null;
  error?: string | null;
  connectedEmail?: string | null;
  idsTried?: string[];
  attempts?: Array<{
    id: string;
    kind: 'message' | 'thread';
    success: boolean;
    errorCode?: number;
    errorMessage?: string;
  }>;
}

const GmailApiResultPanel: React.FC<{ gmailApiResult: GmailApiResult }> = ({ gmailApiResult }) => {
  const { t } = useTranslation();
  const bgColor = gmailApiResult.foundInGmailApi ? '#E3F2FD' : '#F5F5F5';
  const borderColor = gmailApiResult.foundInGmailApi ? '#90CAF9' : '#E0E0E0';
  return (
    <div
      style={{
        marginTop: theme.spacing.md,
        padding: theme.spacing.sm,
        backgroundColor: bgColor,
        borderRadius: theme.borderRadius.sm,
        border: `1px solid ${borderColor}`,
        fontSize: theme.typography.fontSize.xs,
      }}
    >
      <strong>{t('debug.threadLookup.gmailApiResult')}:</strong>
      {gmailApiResult.foundInGmailApi ? (
        <ul style={{ margin: `${theme.spacing.xs} 0 0 0`, paddingLeft: theme.spacing.lg }}>
          <li>
            <strong>{t('debug.threadLookup.gmailApiThreadId')}:</strong>{' '}
            <code style={{ backgroundColor: COLOR_BG_NEUTRAL, padding: '1px 3px', borderRadius: '2px' }}>
              {gmailApiResult.apiThreadId}
            </code>
          </li>
          <li>
            <strong>{t('debug.threadLookup.gmailApiMessageId')}:</strong>{' '}
            <code style={{ backgroundColor: COLOR_BG_NEUTRAL, padding: '1px 3px', borderRadius: '2px' }}>
              {gmailApiResult.apiMessageId}
            </code>
          </li>
          {gmailApiResult.subject && (
            <li>
              <strong>{t('debug.threadLookup.subject')}:</strong> {gmailApiResult.subject}
            </li>
          )}
          {gmailApiResult.from && (
            <li>
              <strong>{t('debug.threadLookup.from')}:</strong> {gmailApiResult.from}
            </li>
          )}
          {gmailApiResult.receivedAt && (
            <li>
              <strong>{t('debug.threadLookup.date')}:</strong> {new Date(gmailApiResult.receivedAt).toLocaleString()}
            </li>
          )}
        </ul>
      ) : (
        <div style={{ marginTop: theme.spacing.xs }}>
          <div style={{ color: COLOR_GREY_MED }}>
            {gmailApiResult.error ?? t('debug.threadLookup.gmailApiNotFound')}
          </div>
          {gmailApiResult.connectedEmail && (
            <div style={{ marginTop: theme.spacing.xs }}>
              <strong>Connected Gmail account:</strong>{' '}
              <code style={{ backgroundColor: COLOR_BG_NEUTRAL, padding: '1px 3px', borderRadius: '2px' }}>
                {gmailApiResult.connectedEmail}
              </code>
            </div>
          )}
          {gmailApiResult.idsTried && gmailApiResult.idsTried.length > 0 && (
            <div style={{ marginTop: theme.spacing.xs }}>
              <strong>Candidate IDs tried:</strong>
              <ul style={{ margin: `${theme.spacing.xs} 0 0 0`, paddingLeft: theme.spacing.lg }}>
                {gmailApiResult.idsTried.map(id => (
                  <li key={id}>
                    <code style={{ backgroundColor: COLOR_BG_NEUTRAL, padding: '1px 3px', borderRadius: '2px' }}>
                      {id}
                    </code>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {gmailApiResult.attempts && gmailApiResult.attempts.length > 0 && (
            <div style={{ marginTop: theme.spacing.xs }}>
              <strong>API attempts:</strong>
              <ul style={{ margin: `${theme.spacing.xs} 0 0 0`, paddingLeft: theme.spacing.lg }}>
                {gmailApiResult.attempts.map((attempt, idx) => (
                  <li key={`${attempt.kind}-${attempt.id}-${idx}`}>
                    {attempt.kind} <code>{attempt.id}</code> →{' '}
                    {attempt.success
                      ? 'ok'
                      : `${attempt.errorCode ?? '?'} ${attempt.errorMessage ?? ''}`}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
export const DebugThreadLookupSection: React.FC<DebugThreadLookupSectionProps> = ({
  threadLookupResult,
  loadingThreadLookup,
  onLookupThread,
}) => {
  const { t } = useTranslation();
  const [threadIdInput, setThreadIdInput] = useState('');

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (threadIdInput.trim()) {
      onLookupThread(threadIdInput.trim());
    }
  };

  return (
    <div
      style={{
        marginBottom: theme.spacing.lg,
        padding: theme.spacing.md,
        backgroundColor: COLOR_WHITE,
        borderRadius: theme.borderRadius.md,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md, marginBottom: theme.spacing.md }}>
        <h4 style={{ margin: 0 }}>
          {EMOJI_SEARCH} {t('debug.threadLookup.sectionTitle')}
        </h4>
      </div>

      <form onSubmit={handleSubmit} style={{ marginBottom: theme.spacing.md }}>
        <div style={{ display: 'flex', gap: theme.spacing.sm, alignItems: 'center' }}>
          <input
            type="text"
            value={threadIdInput}
            onChange={event => setThreadIdInput(event.target.value)}
            placeholder={t('debug.threadLookup.placeholder')}
            style={{
              flex: 1,
              padding: theme.spacing.sm,
              border: `1px solid ${theme.colors.border.light}`,
              borderRadius: theme.borderRadius.sm,
              fontFamily: 'monospace',
              fontSize: theme.typography.fontSize.sm,
            }}
          />
          <button
            type="submit"
            disabled={loadingThreadLookup || !threadIdInput.trim()}
            style={{
              padding: `${theme.spacing.sm} ${theme.spacing.md}`,
              backgroundColor: theme.colors.primary.main,
              color: COLOR_NAMED_WHITE,
              border: STRING_NONE,
              borderRadius: theme.borderRadius.sm,
              cursor: loadingThreadLookup || !threadIdInput.trim() ? 'not-allowed' : 'pointer',
              opacity: loadingThreadLookup || !threadIdInput.trim() ? OPACITY_DISABLED : OPACITY_FULL,
            }}
          >
            {loadingThreadLookup ? t('common.loading') : t('debug.threadLookup.lookupButton')}
          </button>
        </div>
      </form>

      {threadLookupResult && (
        <div
          style={{
            backgroundColor: threadLookupResult.found ? '#E8F5E9' : '#FFEBEE',
            padding: theme.spacing.md,
            borderRadius: theme.borderRadius.sm,
            border: `1px solid ${threadLookupResult.found ? '#A5D6A7' : '#EF9A9A'}`,
          }}
        >
          <div style={{ marginBottom: theme.spacing.md }}>
            <strong>{t('debug.threadLookup.threadId')}:</strong>{' '}
            <code style={{ backgroundColor: COLOR_BG_NEUTRAL, padding: '2px 4px', borderRadius: '3px' }}>
              {threadLookupResult.threadId}
            </code>
          </div>

          <div style={{ marginBottom: theme.spacing.md }}>
            <strong>{t('debug.threadLookup.status')}:</strong>{' '}
            {threadLookupResult.found ? (
              <span style={{ color: COLOR_SUCCESS_DARK }}>{t('debug.threadLookup.found')}</span>
            ) : (
              <span style={{ color: COLOR_ERROR_DARK }}>{t('debug.threadLookup.notFound')}</span>
            )}
          </div>

          {threadLookupResult.thread && (
            <div
              style={{
                marginBottom: theme.spacing.md,
                padding: theme.spacing.sm,
                backgroundColor: COLOR_BG_NEUTRAL,
                borderRadius: theme.borderRadius.sm,
              }}
            >
              <strong>{t('debug.threadLookup.threadDetails')}:</strong>
              <ul style={{ margin: `${theme.spacing.xs} 0 0 0`, paddingLeft: theme.spacing.lg }}>
                <li>
                  {t('debug.threadLookup.starCount')}: {threadLookupResult.thread.starCount}
                </li>
                <li>
                  {t('debug.threadLookup.archived')}:{' '}
                  {threadLookupResult.thread.isArchived ? t('debug.threadLookup.yes') : t('debug.threadLookup.no')}
                </li>
                <li>
                  {t('debug.threadLookup.priorityScore')}:{' '}
                  {threadLookupResult.thread.priorityScore ?? t('debug.threadLookup.notAvailable')}
                </li>
                <li>
                  {t('debug.threadLookup.updatedAt')}: {new Date(threadLookupResult.thread.updatedAt).toLocaleString()}
                </li>
              </ul>
            </div>
          )}

          <VisibilityPanel visibility={threadLookupResult.visibility} />

          <div style={{ marginBottom: theme.spacing.md }}>
            <strong>{t('debug.threadLookup.reasons')}:</strong>
            <ul
              style={{
                margin: `${theme.spacing.xs} 0 0 0`,
                paddingLeft: theme.spacing.lg,
                backgroundColor: COLOR_BG_WARNING,
                padding: theme.spacing.sm,
                borderRadius: theme.borderRadius.sm,
              }}
            >
              {threadLookupResult.reasons.map(reason => (
                <li key={reason} style={{ marginBottom: theme.spacing.xs }}>
                  {reason}
                </li>
              ))}
            </ul>
          </div>

          {threadLookupResult.emails.length > 0 && (
            <div>
              <strong>
                {t('debug.threadLookup.emails')} ({threadLookupResult.emails.length}):
              </strong>
              <div
                style={{
                  marginTop: theme.spacing.xs,
                  maxHeight: '200px',
                  overflowY: 'auto',
                  fontSize: theme.typography.fontSize.xs,
                }}
              >
                {threadLookupResult.emails.map(email => (
                  <div
                    key={email.id}
                    style={{
                      padding: theme.spacing.xs,
                      backgroundColor: COLOR_BG_NEUTRAL,
                      marginBottom: theme.spacing.xs,
                      borderRadius: theme.borderRadius.sm,
                    }}
                  >
                    <div>
                      <strong>{t('debug.threadLookup.emailSubject')}:</strong>{' '}
                      {email.subject || t('debug.threadLookup.noSubject')}
                    </div>
                    <div>
                      <strong>{t('debug.threadLookup.emailFrom')}:</strong> {email.from}
                    </div>
                    <div>
                      <strong>{t('debug.threadLookup.emailReceived')}:</strong>{' '}
                      {new Date(email.receivedAt).toLocaleString()}
                    </div>
                    {email.isSnoozed && (
                      <div style={{ color: COLOR_WARNING_DARK }}>
                        {t('debug.threadLookup.snoozedUntil')}:{' '}
                        {email.snoozeUntil
                          ? new Date(email.snoozeUntil).toLocaleString()
                          : t('debug.threadLookup.notAvailable')}
                      </div>
                    )}
                    {email.isBatched && (
                      <div style={{ color: COLOR_INFO_VIOLET }}>
                        {t('debug.threadLookup.batchedUntil')}:{' '}
                        {email.batchReleaseAt
                          ? new Date(email.batchReleaseAt).toLocaleString()
                          : t('debug.threadLookup.notAvailable')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {threadLookupResult.gmailApiResult && (
            <GmailApiResultPanel gmailApiResult={threadLookupResult.gmailApiResult} />
          )}
        </div>
      )}
    </div>
  );
};
