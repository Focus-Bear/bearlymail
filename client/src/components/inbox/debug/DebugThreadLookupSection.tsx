import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { OPACITY_DISABLED, OPACITY_FULL } from 'constants/numbers';
import { EMOJI_SEARCH } from 'constants/emojis';
import { ThreadLookupResult } from 'hooks/useDebugPanel';

interface DebugThreadLookupSectionProps {
  threadLookupResult: ThreadLookupResult | null;
  loadingThreadLookup: boolean;
  onLookupThread: (threadId: string) => void;
}

export const DebugThreadLookupSection: React.FC<DebugThreadLookupSectionProps> = ({
  threadLookupResult,
  loadingThreadLookup,
  onLookupThread,
}) => {
  const { t } = useTranslation();
  const [threadIdInput, setThreadIdInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (threadIdInput.trim()) {
      onLookupThread(threadIdInput.trim());
    }
  };

  return (
    <div
      style={{
        marginBottom: theme.spacing.lg,
        padding: theme.spacing.md,
        backgroundColor: '#fff',
        borderRadius: theme.borderRadius.md,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.md,
          marginBottom: theme.spacing.md,
        }}
      >
        {/* eslint-disable-next-line i18next/no-literal-string */}
        <h4 style={{ margin: 0 }}>{EMOJI_SEARCH} {t('debug.threadLookup.sectionTitle')}</h4>
      </div>

      <form onSubmit={handleSubmit} style={{ marginBottom: theme.spacing.md }}>
        <div style={{ display: 'flex', gap: theme.spacing.sm, alignItems: 'center' }}>
          <input
            type="text"
            value={threadIdInput}
            onChange={(e) => setThreadIdInput(e.target.value)}
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
              color: 'white',
              border: 'none',
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
            {/* eslint-disable-next-line i18next/no-literal-string */}
            <strong>{t('debug.threadLookup.threadId')}:</strong>{' '}
            <code style={{ backgroundColor: '#f5f5f5', padding: '2px 4px', borderRadius: '3px' }}>
              {threadLookupResult.threadId}
            </code>
          </div>

          <div style={{ marginBottom: theme.spacing.md }}>
            {/* eslint-disable-next-line i18next/no-literal-string */}
            <strong>{t('debug.threadLookup.status')}:</strong>{' '}
            {threadLookupResult.found ? (
              <span style={{ color: '#2E7D32' }}>{t('debug.threadLookup.found')}</span>
            ) : (
              <span style={{ color: '#C62828' }}>{t('debug.threadLookup.notFound')}</span>
            )}
          </div>

          {threadLookupResult.thread && (
            <div
              style={{
                marginBottom: theme.spacing.md,
                padding: theme.spacing.sm,
                backgroundColor: '#f5f5f5',
                borderRadius: theme.borderRadius.sm,
              }}
            >
              {/* eslint-disable-next-line i18next/no-literal-string */}
              <strong>{t('debug.threadLookup.threadDetails')}:</strong>
              <ul style={{ margin: `${theme.spacing.xs} 0 0 0`, paddingLeft: theme.spacing.lg }}>
                {/* eslint-disable-next-line i18next/no-literal-string */}
                <li>Star Count: {threadLookupResult.thread.starCount}</li>
                {/* eslint-disable-next-line i18next/no-literal-string */}
                <li>Archived: {threadLookupResult.thread.isArchived ? 'Yes' : 'No'}</li>
                {/* eslint-disable-next-line i18next/no-literal-string */}
                <li>Priority Score: {threadLookupResult.thread.priorityScore ?? 'N/A'}</li>
                {/* eslint-disable-next-line i18next/no-literal-string */}
                <li>Updated At: {new Date(threadLookupResult.thread.updatedAt).toLocaleString()}</li>
              </ul>
            </div>
          )}

          <div style={{ marginBottom: theme.spacing.md }}>
            {/* eslint-disable-next-line i18next/no-literal-string */}
            <strong>{t('debug.threadLookup.visibility')}:</strong>
            <ul style={{ margin: `${theme.spacing.xs} 0 0 0`, paddingLeft: theme.spacing.lg }}>
              <li style={{ color: threadLookupResult.visibility.wouldShowInTriage ? '#2E7D32' : '#C62828' }}>
                {/* eslint-disable-next-line i18next/no-literal-string */}
                Triage: {threadLookupResult.visibility.wouldShowInTriage ? 'Yes' : 'No'}
              </li>
              <li style={{ color: threadLookupResult.visibility.wouldShowInAction ? '#2E7D32' : '#C62828' }}>
                {/* eslint-disable-next-line i18next/no-literal-string */}
                Action: {threadLookupResult.visibility.wouldShowInAction ? 'Yes' : 'No'}
              </li>
              <li style={{ color: threadLookupResult.visibility.wouldShowInFollowUp ? '#2E7D32' : '#C62828' }}>
                {/* eslint-disable-next-line i18next/no-literal-string */}
                Follow-up: {threadLookupResult.visibility.wouldShowInFollowUp ? 'Yes' : 'No'}
              </li>
            </ul>
          </div>

          <div style={{ marginBottom: theme.spacing.md }}>
            {/* eslint-disable-next-line i18next/no-literal-string */}
            <strong>{t('debug.threadLookup.reasons')}:</strong>
            <ul
              style={{
                margin: `${theme.spacing.xs} 0 0 0`,
                paddingLeft: theme.spacing.lg,
                backgroundColor: '#FFF3E0',
                padding: theme.spacing.sm,
                borderRadius: theme.borderRadius.sm,
              }}
            >
              {threadLookupResult.reasons.map((reason, index) => (
                <li key={index} style={{ marginBottom: theme.spacing.xs }}>
                  {reason}
                </li>
              ))}
            </ul>
          </div>

          {threadLookupResult.emails.length > 0 && (
            <div>
              {/* eslint-disable-next-line i18next/no-literal-string */}
              <strong>{t('debug.threadLookup.emails')} ({threadLookupResult.emails.length}):</strong>
              <div
                style={{
                  marginTop: theme.spacing.xs,
                  maxHeight: '200px',
                  overflowY: 'auto',
                  fontSize: theme.typography.fontSize.xs,
                }}
              >
                {threadLookupResult.emails.map((email) => (
                  <div
                    key={email.id}
                    style={{
                      padding: theme.spacing.xs,
                      backgroundColor: '#f5f5f5',
                      marginBottom: theme.spacing.xs,
                      borderRadius: theme.borderRadius.sm,
                    }}
                  >
                    <div>
                      {/* eslint-disable-next-line i18next/no-literal-string */}
                      <strong>Subject:</strong> {email.subject || '(no subject)'}
                    </div>
                    <div>
                      {/* eslint-disable-next-line i18next/no-literal-string */}
                      <strong>From:</strong> {email.from}
                    </div>
                    <div>
                      {/* eslint-disable-next-line i18next/no-literal-string */}
                      <strong>Received:</strong> {new Date(email.receivedAt).toLocaleString()}
                    </div>
                    {email.isSnoozed && (
                      <div style={{ color: '#F57C00' }}>
                        {/* eslint-disable-next-line i18next/no-literal-string */}
                        Snoozed until: {email.snoozeUntil ? new Date(email.snoozeUntil).toLocaleString() : 'N/A'}
                      </div>
                    )}
                    {email.isBatched && (
                      <div style={{ color: '#7B1FA2' }}>
                        {/* eslint-disable-next-line i18next/no-literal-string */}
                        Batched until: {email.batchReleaseAt ? new Date(email.batchReleaseAt).toLocaleString() : 'N/A'}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {threadLookupResult.gmailApiResult && (
            <div
              style={{
                marginTop: theme.spacing.md,
                padding: theme.spacing.sm,
                backgroundColor: threadLookupResult.gmailApiResult.foundInGmailApi ? '#E3F2FD' : '#F5F5F5',
                borderRadius: theme.borderRadius.sm,
                border: `1px solid ${threadLookupResult.gmailApiResult.foundInGmailApi ? '#90CAF9' : '#E0E0E0'}`,
                fontSize: theme.typography.fontSize.xs,
              }}
            >
              {/* eslint-disable-next-line i18next/no-literal-string */}
              <strong>{t('debug.threadLookup.gmailApiResult')}:</strong>
              {threadLookupResult.gmailApiResult.foundInGmailApi ? (
                <ul style={{ margin: `${theme.spacing.xs} 0 0 0`, paddingLeft: theme.spacing.lg }}>
                  {/* eslint-disable-next-line i18next/no-literal-string */}
                  <li><strong>Gmail API Thread ID:</strong> <code style={{ backgroundColor: '#f5f5f5', padding: '1px 3px', borderRadius: '2px' }}>{threadLookupResult.gmailApiResult.apiThreadId}</code></li>
                  {/* eslint-disable-next-line i18next/no-literal-string */}
                  <li><strong>Gmail API Message ID:</strong> <code style={{ backgroundColor: '#f5f5f5', padding: '1px 3px', borderRadius: '2px' }}>{threadLookupResult.gmailApiResult.apiMessageId}</code></li>
                  {/* eslint-disable-next-line i18next/no-literal-string */}
                  {threadLookupResult.gmailApiResult.subject && <li><strong>Subject:</strong> {threadLookupResult.gmailApiResult.subject}</li>}
                  {/* eslint-disable-next-line i18next/no-literal-string */}
                  {threadLookupResult.gmailApiResult.from && <li><strong>From:</strong> {threadLookupResult.gmailApiResult.from}</li>}
                  {/* eslint-disable-next-line i18next/no-literal-string */}
                  {threadLookupResult.gmailApiResult.receivedAt && <li><strong>Date:</strong> {new Date(threadLookupResult.gmailApiResult.receivedAt).toLocaleString()}</li>}
                </ul>
              ) : (
                <span style={{ color: '#757575', marginLeft: theme.spacing.xs }}>
                  {t('debug.threadLookup.gmailApiNotFound')}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
