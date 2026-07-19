import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';
import { Email, GitHubLink } from 'types/email';
import { getAxiosResponseErrorMessage } from 'utils/axios-error-message';
import { emailMentionsGitHub } from 'utils/githubUtils';
import { getMfaErrorType } from 'utils/mfaErrors';

import { useAdminMfa } from 'components/admin/AdminMfaGate';
import { API_URL } from 'config/api';

/** Opacity for controls in a non-interactive (loading) state */
const DISABLED_CONTROL_OPACITY = 0.7;

interface Props {
  email: any;
  threadEmails: Email[];
  /** Re-load email + thread after Gmail attachment metadata is synced */
  onAttachmentsSynced?: () => Promise<void>;
  githubLinks?: GitHubLink[];
  loadingGithub?: boolean;
  hasGithubToken?: boolean;
}

function formatStoredAttachmentsSummary(att: unknown, noneLabel: string): string {
  if (!Array.isArray(att) || att.length === 0) {
    return noneLabel;
  }
  const names = att.map((attachment: { filename?: string }) => attachment.filename || '?').join(', ');
  return `${att.length} (${names})`;
}

interface ThreadEmailsListProps {
  threadEmails: Email[];
}

const threadEntryBoxStyle: React.CSSProperties = {
  marginLeft: theme.spacing.md,
  marginTop: theme.spacing.sm,
  paddingLeft: theme.spacing.sm,
  borderLeft: `2px solid ${theme.colors.border.light}`,
  wordBreak: 'break-word',
};

const ThreadEmailsList: React.FC<ThreadEmailsListProps> = ({ threadEmails }) => {
  const { t } = useTranslation();
  const none = t('debug.emailDetail.attachmentsNone');
  return (
    <div style={{ marginTop: theme.spacing.md }}>
      <strong>{t('debug.emailDetail.threadEmails', { count: threadEmails.length })}</strong>
      {threadEmails.map((threadEmail, idx) => {
        const threadEmailData = threadEmail as any;
        return (
          <div key={threadEmail.id} style={{ ...threadEntryBoxStyle, marginTop: theme.spacing.xs }}>
            {t('debug.emailDetail.threadEmailItem', {
              idx,
              messageId: threadEmailData.messageId || t('debug.emailDetail.notAvailable'),
              attachments: formatStoredAttachmentsSummary(threadEmailData.attachments, none),
              labels: threadEmailData.labels ? JSON.stringify(threadEmailData.labels) : '[]',
              receivedAt: threadEmailData.receivedAt,
            })}
          </div>
        );
      })}
    </div>
  );
};

interface RefreshResult {
  threadId: string;
  threadEmailCount: number;
  results: Array<{
    emailId: string;
    gmailMessageId: string;
    attachments: Array<{ attachmentId: string; filename: string; mimeType: string; size: number }> | null;
    gmailCount: number | null;
    dbCount: number | null;
    dbError?: string;
    error?: string;
  }>;
}

type RawColumnClassification =
  | 'null'
  | 'encrypted'
  | 'pg-array-literal'
  | 'json-array'
  | 'json-object'
  | 'plain-string';

interface RawColumnInfo {
  preview: string | null;
  classification: RawColumnClassification;
  length: number | null;
}

interface RawColumnsResult {
  id: string;
  userId: string;
  messageId: string;
  threadId: string;
  columns: Record<string, RawColumnInfo>;
}

interface ParsedGitHubLink {
  type: 'issue' | 'pr';
  owner: string;
  repo: string;
  number: number;
  url: string;
}

interface FollowUpDebugInfo {
  emailId: string;
  threadId: string;
  emailThreadId: string | null;
  thread: {
    starCount: number;
    isArchived: boolean;
    isSnoozed: boolean;
    snoozeUntil: string | null;
    lastUserOperationAt: string | null;
  } | null;
  replyHistory: {
    userSentLast: boolean;
    replyReceived: boolean;
    lastMyReplyAt: string | null;
    lastTheirReplyAt: string | null;
  };
  followUpRecords: Array<{
    id: string;
    status: string;
    followUpDueAt: string;
    followUpDays: number;
    sentEmailId: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  activeFollowUpDueAt: string | null;
  verdict: {
    qualifiesForFollowUpMode: boolean;
    reasons: string[];
  };
}

interface PhishingDebugInfo {
  emailId: string;
  from: string | null;
  fromName: string | null;
  stored: {
    confidence: 'low' | 'medium' | 'high' | null;
    reason: string | null;
  };
  signals: {
    hasDomainMismatch: boolean;
    senderDomain: string | null;
    linkedDomains: string[];
    suspiciousKeywords: string[];
    rawScore: number;
  };
  displayNameCheck: {
    mismatch: boolean;
    displayName: string | null;
    senderDomain: string | null;
    detail: string;
  };
}

interface GitHubScanResult {
  bodyClassification: RawColumnClassification;
  bodyDecrypted: boolean;
  htmlBodyClassification: RawColumnClassification;
  htmlBodyDecrypted: boolean;
  fromClassification: RawColumnClassification;
  isGitHubNotification: boolean;
  linksFound: ParsedGitHubLink[];
}

const CLASSIFICATION_COLOR: Record<RawColumnClassification, string> = {
  'null': 'gray',
  'encrypted': 'green',
  'pg-array-literal': 'red',
  'json-array': 'orange',
  'json-object': 'orange',
  'plain-string': 'orange',
};

/** Admin-only debug information panel shown in email detail view. */
export function EmailDetailDebugInfo({ email, threadEmails, onAttachmentsSynced, githubLinks, loadingGithub, hasGithubToken }: Props) {
  const { t } = useTranslation();
  const { onMfaRequired } = useAdminMfa();
  const emailData = email as any;
  const attachmentsNone = t('debug.emailDetail.attachmentsNone');
  const [refreshingAttachments, setRefreshingAttachments] = useState(false);
  const [lastRefreshResult, setLastRefreshResult] = useState<RefreshResult | null>(null);
  const [lastRefreshError, setLastRefreshError] = useState<string | null>(null);
  const [loadingRawColumns, setLoadingRawColumns] = useState(false);
  const [rawColumns, setRawColumns] = useState<RawColumnsResult | null>(null);
  const [rawColumnsError, setRawColumnsError] = useState<string | null>(null);
  const [loadingGithubScan, setLoadingGithubScan] = useState(false);
  const [githubScanResult, setGithubScanResult] = useState<GitHubScanResult | null>(null);
  const [githubScanError, setGithubScanError] = useState<string | null>(null);
  const [loadingFollowUp, setLoadingFollowUp] = useState(false);
  const [followUpDebug, setFollowUpDebug] = useState<FollowUpDebugInfo | null>(null);
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const [loadingPhishing, setLoadingPhishing] = useState(false);
  const [phishingDebug, setPhishingDebug] = useState<PhishingDebugInfo | null>(null);
  const [phishingError, setPhishingError] = useState<string | null>(null);

  const handleShowRawColumns = async () => {
    if (!emailData?.id || loadingRawColumns) {
      return;
    }
    setLoadingRawColumns(true);
    setRawColumns(null);
    setRawColumnsError(null);
    try {
      const response = await axios.get<RawColumnsResult>(
        `${API_URL}/emails/${emailData.id}/debug/raw-columns`,
      );
      setRawColumns(response.data);
    } catch (err) {
      console.error('rawColumns:', err);
      const msg = getAxiosResponseErrorMessage(err) ?? t('debug.emailDetail.rawColumnsFailed');
      setRawColumnsError(msg);
    } finally {
      setLoadingRawColumns(false);
    }
  };

  const handleShowFollowUpDebug = async () => {
    if (!emailData?.id || loadingFollowUp) {
      return;
    }
    setLoadingFollowUp(true);
    setFollowUpDebug(null);
    setFollowUpError(null);
    try {
      const response = await axios.get<FollowUpDebugInfo>(
        `${API_URL}/emails/${emailData.id}/debug/follow-up-status`,
      );
      setFollowUpDebug(response.data);
    } catch (err) {
      console.error('followUpDebug:', err);
      const msg = getAxiosResponseErrorMessage(err) ?? t('debug.emailDetail.followUpFailed');
      setFollowUpError(msg);
    } finally {
      setLoadingFollowUp(false);
    }
  };

  const handleShowPhishingDebug = async () => {
    if (!emailData?.id || loadingPhishing) {
      return;
    }
    setLoadingPhishing(true);
    setPhishingDebug(null);
    setPhishingError(null);
    try {
      const response = await axios.get<PhishingDebugInfo>(
        `${API_URL}/emails/${emailData.id}/debug/phishing`,
      );
      setPhishingDebug(response.data);
    } catch (err) {
      console.error('phishingDebug:', err);
      const msg = getAxiosResponseErrorMessage(err) ?? t('debug.emailDetail.phishingFailed');
      setPhishingError(msg);
    } finally {
      setLoadingPhishing(false);
    }
  };

  const handleScanGitHubLinks = async () => {
    if (!emailData?.id || loadingGithubScan) {
      return;
    }
    setLoadingGithubScan(true);
    setGithubScanResult(null);
    setGithubScanError(null);
    try {
      const response = await axios.get<GitHubScanResult>(
        `${API_URL}/emails/${emailData.id}/debug/github-scan`,
      );
      setGithubScanResult(response.data);
    } catch (err) {
      console.error('githubScan:', err);
      const msg = getAxiosResponseErrorMessage(err) ?? t('debug.emailDetail.githubScanFailed');
      setGithubScanError(msg);
    } finally {
      setLoadingGithubScan(false);
    }
  };

  const handleRefreshAttachmentsFromGmail = async () => {
    if (!emailData?.id || refreshingAttachments) {
      return;
    }
    setRefreshingAttachments(true);
    setLastRefreshResult(null);
    setLastRefreshError(null);
    try {
      const response = await axios.post<RefreshResult>(
        `${API_URL}/emails/${emailData.id}/debug/refresh-attachments-from-gmail`,
      );
      setLastRefreshResult(response.data);
      await onAttachmentsSynced?.();
    } catch (err) {
      const mfaType = getMfaErrorType(err);
      if (mfaType) {
        onMfaRequired(mfaType);
        return;
      }
      console.error('refreshAttachmentsFromGmail:', err);
      const msg = getAxiosResponseErrorMessage(err) ?? t('debug.emailDetail.refreshAttachmentsFailed');
      setLastRefreshError(msg);
    } finally {
      setRefreshingAttachments(false);
    }
  };

  return (
    <div
      style={{
        marginTop: theme.spacing.xl,
        padding: theme.spacing.lg,
        backgroundColor: theme.colors.background.subtle,
        borderRadius: theme.borderRadius.md,
        border: `1px solid ${theme.colors.border.light}`,
      }}
    >
      <h3
        style={{
          marginTop: 0,
          marginBottom: theme.spacing.md,
          fontSize: theme.typography.fontSize.sm,
          fontWeight: 600,
          color: theme.colors.text.primary,
        }}
      >
        {t('debug.emailDetail.title')}
      </h3>
      <div
        style={{
          fontFamily: 'monospace',
          fontSize: theme.typography.fontSize.xs,
          color: theme.colors.text.secondary,
          lineHeight: 1.6,
        }}
      >
        <div>
          <strong>{t('debug.emailDetail.gmailMessageId')}:</strong>{' '}
          {emailData.messageId || t('debug.emailDetail.notAvailable')}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <strong>{t('debug.emailDetail.gmailThreadId')}:</strong>
          <code
            style={{
              backgroundColor: theme.colors.primary.subtle,
              padding: '2px 6px',
              borderRadius: '4px',
              fontFamily: 'monospace',
            }}
          >
            {emailData.threadId || t('debug.emailDetail.notAvailable')}
          </code>
          {emailData.threadId && (
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(emailData.threadId);
                alert(t('debug.emailDetail.threadIdCopied'));
              }}
              style={{
                padding: '2px 8px',
                fontSize: '11px',
                backgroundColor: theme.colors.primary.main,
                color: theme.colors.background.paper,
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              {t('debug.emailDetail.copyButton')}
            </button>
          )}
        </div>
        <div>
          <strong>{t('debug.emailDetail.to')}:</strong> {emailData.to || t('debug.emailDetail.notAvailable')}
        </div>
        <div>
          <strong>{t('debug.emailDetail.cc')}:</strong> {emailData.cc || t('debug.emailDetail.notAvailable')}
        </div>
        <div>
          <strong>{t('debug.emailDetail.labels')}:</strong> {emailData.labels ? JSON.stringify(emailData.labels) : '[]'}
        </div>
        <div>
          <strong>{t('debug.emailDetail.labelsCount')}:</strong> {emailData.labels?.length || 0}
        </div>
        <div>
          <strong>{t('debug.emailDetail.receivedAt')}:</strong> {emailData.receivedAt}
        </div>
        <div>
          <strong>{t('debug.emailDetail.isRead')}:</strong>{' '}
          {emailData.isRead ? t('debug.emailDetail.true') : t('debug.emailDetail.false')}
        </div>
        <div>
          <strong>{t('debug.emailDetail.isArchived')}:</strong>{' '}
          {emailData.isArchived ? t('debug.emailDetail.true') : t('debug.emailDetail.false')}
        </div>
        <div>
          <strong>{t('debug.emailDetail.starCount')}:</strong> {emailData.starCount || 0}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm, flexWrap: 'wrap' }}>
          <span>
            <strong>{t('debug.emailDetail.attachments')}:</strong>{' '}
            {formatStoredAttachmentsSummary(emailData.attachments, attachmentsNone)}
          </span>
          {emailData.messageId && (
            <button
              type="button"
              disabled={refreshingAttachments}
              onClick={() => void handleRefreshAttachmentsFromGmail()}
              style={{
                padding: '2px 8px',
                fontSize: '11px',
                backgroundColor: theme.colors.background.paper,
                color: theme.colors.text.primary,
                border: `1px solid ${theme.colors.border.light}`,
                borderRadius: '4px',
                cursor: refreshingAttachments ? 'not-allowed' : 'pointer',
                opacity: refreshingAttachments ? DISABLED_CONTROL_OPACITY : 1,
              }}
            >
              {refreshingAttachments
                ? t('debug.emailDetail.refreshingAttachments')
                : t('debug.emailDetail.refreshAttachmentsFromGmail')}
            </button>
          )}
        </div>
        {lastRefreshError && (
          <div style={{ marginTop: theme.spacing.sm, color: 'red', fontWeight: 600 }}>
            {t('debug.emailDetail.refreshError')}: {lastRefreshError}
          </div>
        )}
        {lastRefreshResult && (
          <div style={{ marginTop: theme.spacing.sm, borderTop: `1px dashed ${theme.colors.border.light}`, paddingTop: theme.spacing.sm }}>
            <strong>{t('debug.emailDetail.lastRefreshResult')}</strong>
            <div>{t('debug.emailDetail.refreshThreadId')}: <code>{lastRefreshResult.threadId}</code></div>
            <div>{t('debug.emailDetail.refreshThreadEmailCount')}: {lastRefreshResult.threadEmailCount}</div>
            {lastRefreshResult.results.map((emailRes, idx) => (
              <div key={emailRes.emailId} style={{ ...threadEntryBoxStyle, marginTop: theme.spacing.xs }}>
                <div>[{idx}] emailId: {emailRes.emailId}</div>
                <div>&nbsp;&nbsp;gmailMsgId: {emailRes.gmailMessageId || t('debug.emailDetail.notAvailable')}</div>
                <div style={{ color: emailRes.gmailCount != null && emailRes.gmailCount > 0 ? 'green' : 'inherit' }}>
                  &nbsp;&nbsp;{t('debug.emailDetail.refreshGmailCount')}: {emailRes.gmailCount ?? t('debug.emailDetail.notAvailable')}
                </div>
                <div style={{ color: emailRes.dbCount != null && emailRes.dbCount > 0 ? 'green' : emailRes.dbCount === 0 ? 'orange' : 'red' }}>
                  &nbsp;&nbsp;{t('debug.emailDetail.refreshDbCount')}: {emailRes.dbCount ?? t('debug.emailDetail.notAvailable')}
                </div>
                {emailRes.error && <div style={{ color: 'red' }}>&nbsp;&nbsp;error: {emailRes.error}</div>}
                {emailRes.dbError && <div style={{ color: 'orange' }}>&nbsp;&nbsp;dbError: {emailRes.dbError}</div>}
              </div>
            ))}
          </div>
        )}
        {threadEmails && threadEmails.length > 0 && <ThreadEmailsList threadEmails={threadEmails} />}
        <div style={{ marginTop: theme.spacing.md, borderTop: `1px solid ${theme.colors.border.light}`, paddingTop: theme.spacing.md }}>
          <button
            type="button"
            disabled={loadingRawColumns}
            onClick={() => void handleShowRawColumns()}
            style={{
              padding: '2px 8px',
              fontSize: '11px',
              backgroundColor: theme.colors.background.paper,
              color: theme.colors.text.primary,
              border: `1px solid ${theme.colors.border.light}`,
              borderRadius: '4px',
              cursor: loadingRawColumns ? 'not-allowed' : 'pointer',
              opacity: loadingRawColumns ? DISABLED_CONTROL_OPACITY : 1,
            }}
          >
            {loadingRawColumns
              ? t('debug.emailDetail.loadingRawColumns')
              : t('debug.emailDetail.showRawColumns')}
          </button>
          {rawColumnsError && (
            <div style={{ marginTop: theme.spacing.sm, color: 'red', fontWeight: 600 }}>
              {rawColumnsError}
            </div>
          )}
          {rawColumns && (
            <div style={{ marginTop: theme.spacing.sm }}>
              <strong>{t('debug.emailDetail.rawColumnsTitle')}</strong>
              {Object.entries(rawColumns.columns).map(([colName, info]) => (
                <div key={colName} style={{ ...threadEntryBoxStyle, marginTop: theme.spacing.xs }}>
                  <div>
                    <strong>{colName}</strong>{' '}
                    <span style={{ color: CLASSIFICATION_COLOR[info.classification], fontWeight: 600 }}>
                      [{info.classification}]
                    </span>
                    {info.length != null && (
                      <span style={{ color: theme.colors.text.secondary }}> ({info.length} chars)</span>
                    )}
                  </div>
                  {info.preview != null && (
                    <pre style={{ margin: 0, fontSize: '10px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                      {info.preview}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ marginTop: theme.spacing.md, borderTop: `1px solid ${theme.colors.border.light}`, paddingTop: theme.spacing.md }}>
          <strong>{t('debug.emailDetail.githubTitle')}</strong>
          <div>
            <strong>{t('debug.emailDetail.githubLoading')}:</strong>{' '}
            {loadingGithub ? t('debug.emailDetail.true') : t('debug.emailDetail.false')}
          </div>
          <div>
            <strong>{t('debug.emailDetail.githubHasToken')}:</strong>{' '}
            {hasGithubToken ? t('debug.emailDetail.true') : t('debug.emailDetail.false')}
          </div>
          <div>
            <strong>{t('debug.emailDetail.githubMentionsGitHub')}:</strong>{' '}
            {emailMentionsGitHub(emailData.subject, emailData.body, emailData.htmlBody, emailData.from)
              ? t('debug.emailDetail.true')
              : t('debug.emailDetail.false')}
          </div>
          <div>
            <strong>{t('debug.emailDetail.githubLinksCount')}:</strong> {githubLinks?.length ?? 0}
          </div>
          {githubLinks && githubLinks.length > 0 ? (
            githubLinks.map((link, idx) => (
              <div key={link.url ?? idx} style={{ ...threadEntryBoxStyle, marginTop: theme.spacing.xs }}>
                {t('debug.emailDetail.githubLinkItem', {
                  idx,
                  url: link.url ?? `${link.owner}/${link.repo}#${link.number}`,
                  type: link.type,
                })}
              </div>
            ))
          ) : (
            <div style={{ marginLeft: theme.spacing.md, color: theme.colors.text.secondary }}>
              {t('debug.emailDetail.githubNoLinks')}
            </div>
          )}
          <div style={{ marginTop: theme.spacing.sm }}>
            <button
              type="button"
              disabled={loadingGithubScan}
              onClick={() => void handleScanGitHubLinks()}
              style={{
                padding: '2px 8px',
                fontSize: '11px',
                backgroundColor: theme.colors.background.paper,
                color: theme.colors.text.primary,
                border: `1px solid ${theme.colors.border.light}`,
                borderRadius: '4px',
                cursor: loadingGithubScan ? 'not-allowed' : 'pointer',
                opacity: loadingGithubScan ? DISABLED_CONTROL_OPACITY : 1,
              }}
            >
              {loadingGithubScan
                ? t('debug.emailDetail.githubScanning')
                : t('debug.emailDetail.githubScanBody')}
            </button>
          </div>
          {githubScanError && (
            <div style={{ marginTop: theme.spacing.sm, color: 'red', fontWeight: 600 }}>
              {githubScanError}
            </div>
          )}
          {githubScanResult && (
            <div style={{ marginTop: theme.spacing.sm, borderTop: `1px dashed ${theme.colors.border.light}`, paddingTop: theme.spacing.sm }}>
              <strong>{t('debug.emailDetail.githubScanResultTitle')}</strong>
              <div>
                <strong>{t('debug.emailDetail.githubScanBodyStatus')}:</strong>{' '}
                <span style={{ color: CLASSIFICATION_COLOR[githubScanResult.bodyClassification], fontWeight: 600 }}>
                  [{githubScanResult.bodyClassification}]
                </span>
                {' '}{githubScanResult.bodyDecrypted ? '✓ decrypted' : '✗ decrypt failed'}
              </div>
              <div>
                <strong>{t('debug.emailDetail.githubScanHtmlStatus')}:</strong>{' '}
                <span style={{ color: CLASSIFICATION_COLOR[githubScanResult.htmlBodyClassification], fontWeight: 600 }}>
                  [{githubScanResult.htmlBodyClassification}]
                </span>
                {' '}{githubScanResult.htmlBodyDecrypted ? '✓ decrypted' : '✗ decrypt failed'}
              </div>
              <div>
                <strong>{t('debug.emailDetail.githubScanIsNotification')}:</strong>{' '}
                {githubScanResult.isGitHubNotification ? t('debug.emailDetail.true') : t('debug.emailDetail.false')}
              </div>
              <div>
                <strong>{t('debug.emailDetail.githubScanLinksFound')}:</strong> {githubScanResult.linksFound.length}
              </div>
              {githubScanResult.linksFound.length > 0 ? (
                githubScanResult.linksFound.map((link, idx) => (
                  <div key={link.url ?? idx} style={{ ...threadEntryBoxStyle, marginTop: theme.spacing.xs }}>
                    {t('debug.emailDetail.githubLinkItem', {
                      idx,
                      url: link.url ?? `${link.owner}/${link.repo}#${link.number}`,
                      type: link.type,
                    })}
                  </div>
                ))
              ) : (
                <div style={{ marginLeft: theme.spacing.md, color: 'red' }}>
                  {t('debug.emailDetail.githubScanNoLinks')}
                </div>
              )}
            </div>
          )}
        </div>
        <div style={{ marginTop: theme.spacing.md, borderTop: `1px solid ${theme.colors.border.light}`, paddingTop: theme.spacing.md }}>
          <strong>{t('debug.emailDetail.phishingTitle')}</strong>
          <div>
            <strong>{t('debug.emailDetail.phishingStoredConfidence')}:</strong>{' '}
            <span style={{ color: emailData.phishingConfidence ? 'orange' : theme.colors.text.secondary, fontWeight: 600 }}>
              {emailData.phishingConfidence ?? t('debug.emailDetail.phishingNotFlagged')}
            </span>
          </div>
          {emailData.phishingReason && (
            <div>
              <strong>{t('debug.emailDetail.phishingStoredReason')}:</strong> {emailData.phishingReason}
            </div>
          )}
          <div style={{ marginTop: theme.spacing.sm }}>
            <button
              type="button"
              disabled={loadingPhishing}
              onClick={() => void handleShowPhishingDebug()}
              style={{
                padding: '2px 8px',
                fontSize: '11px',
                backgroundColor: theme.colors.background.paper,
                color: theme.colors.text.primary,
                border: `1px solid ${theme.colors.border.light}`,
                borderRadius: '4px',
                cursor: loadingPhishing ? 'not-allowed' : 'pointer',
                opacity: loadingPhishing ? DISABLED_CONTROL_OPACITY : 1,
              }}
            >
              {loadingPhishing
                ? t('debug.emailDetail.phishingLoading')
                : t('debug.emailDetail.phishingLoad')}
            </button>
          </div>
          {phishingError && (
            <div style={{ marginTop: theme.spacing.sm, color: 'red', fontWeight: 600 }}>
              {phishingError}
            </div>
          )}
          {phishingDebug && (
            <div style={{ marginTop: theme.spacing.sm }}>
              <div style={{ ...threadEntryBoxStyle, marginTop: theme.spacing.sm }}>
                <strong>{t('debug.emailDetail.phishingSenderSection')}</strong>
                <div>{t('debug.emailDetail.phishingFromName')}: {phishingDebug.fromName ?? t('debug.emailDetail.notAvailable')}</div>
                <div>{t('debug.emailDetail.phishingFrom')}: {phishingDebug.from ?? t('debug.emailDetail.notAvailable')}</div>
                <div>{t('debug.emailDetail.phishingSenderDomain')}: {phishingDebug.signals.senderDomain ?? t('debug.emailDetail.notAvailable')}</div>
              </div>
              <div style={{ ...threadEntryBoxStyle, marginTop: theme.spacing.sm }}>
                <strong>{t('debug.emailDetail.phishingDisplayNameCheckSection')}</strong>
                <div>
                  {t('debug.emailDetail.phishingDisplayNameMismatch')}:{' '}
                  <span style={{ color: phishingDebug.displayNameCheck.mismatch ? 'red' : 'green', fontWeight: 600 }}>
                    {phishingDebug.displayNameCheck.mismatch ? t('debug.emailDetail.true') : t('debug.emailDetail.false')}
                  </span>
                </div>
                <div>{phishingDebug.displayNameCheck.detail}</div>
              </div>
              <div style={{ ...threadEntryBoxStyle, marginTop: theme.spacing.sm }}>
                <strong>{t('debug.emailDetail.phishingSignalsSection')}</strong>
                <div>
                  {t('debug.emailDetail.phishingDomainMismatch')}:{' '}
                  <span style={{ color: phishingDebug.signals.hasDomainMismatch ? 'red' : 'green', fontWeight: 600 }}>
                    {phishingDebug.signals.hasDomainMismatch ? t('debug.emailDetail.true') : t('debug.emailDetail.false')}
                  </span>
                </div>
                <div>{t('debug.emailDetail.phishingLinkedDomains')}: {phishingDebug.signals.linkedDomains.join(', ') || t('debug.emailDetail.phishingNone')}</div>
                <div>{t('debug.emailDetail.phishingSuspiciousKeywords')}: {phishingDebug.signals.suspiciousKeywords.join(', ') || t('debug.emailDetail.phishingNone')}</div>
                <div>{t('debug.emailDetail.phishingRawScore')}: {phishingDebug.signals.rawScore}</div>
              </div>
            </div>
          )}
        </div>
        <div style={{ marginTop: theme.spacing.md, borderTop: `1px solid ${theme.colors.border.light}`, paddingTop: theme.spacing.md }}>
          <strong>{t('debug.emailDetail.followUpTitle')}</strong>
          <div style={{ marginTop: theme.spacing.sm }}>
            <button
              type="button"
              disabled={loadingFollowUp}
              onClick={() => void handleShowFollowUpDebug()}
              style={{
                padding: '2px 8px',
                fontSize: '11px',
                backgroundColor: theme.colors.background.paper,
                color: theme.colors.text.primary,
                border: `1px solid ${theme.colors.border.light}`,
                borderRadius: '4px',
                cursor: loadingFollowUp ? 'not-allowed' : 'pointer',
                opacity: loadingFollowUp ? DISABLED_CONTROL_OPACITY : 1,
              }}
            >
              {loadingFollowUp
                ? t('debug.emailDetail.followUpLoading')
                : t('debug.emailDetail.followUpLoad')}
            </button>
          </div>
          {followUpError && (
            <div style={{ marginTop: theme.spacing.sm, color: 'red', fontWeight: 600 }}>
              {followUpError}
            </div>
          )}
          {followUpDebug && (
            <div style={{ marginTop: theme.spacing.sm }}>
              <div>
                <strong>{t('debug.emailDetail.followUpVerdict')}:</strong>{' '}
                <span style={{ color: followUpDebug.verdict.qualifiesForFollowUpMode ? 'green' : 'red', fontWeight: 600 }}>
                  {followUpDebug.verdict.qualifiesForFollowUpMode
                    ? t('debug.emailDetail.followUpVerdictYes')
                    : t('debug.emailDetail.followUpVerdictNo')}
                </span>
              </div>
              <div style={{ marginTop: theme.spacing.xs }}>
                <strong>{t('debug.emailDetail.followUpReasons')}:</strong>
                <ul style={{ margin: `${theme.spacing.xs} 0 0 ${theme.spacing.lg}`, padding: 0 }}>
                  {followUpDebug.verdict.reasons.map((reason, idx) => (
                    <li key={idx}>{reason}</li>
                  ))}
                </ul>
              </div>
              <div style={{ ...threadEntryBoxStyle, marginTop: theme.spacing.sm }}>
                <strong>{t('debug.emailDetail.followUpThreadSection')}</strong>
                {followUpDebug.thread ? (
                  <>
                    <div>{t('debug.emailDetail.followUpThreadStarCount')}: {followUpDebug.thread.starCount}</div>
                    <div>{t('debug.emailDetail.followUpThreadIsArchived')}: {followUpDebug.thread.isArchived ? t('debug.emailDetail.true') : t('debug.emailDetail.false')}</div>
                    <div>{t('debug.emailDetail.followUpThreadIsSnoozed')}: {followUpDebug.thread.isSnoozed ? t('debug.emailDetail.true') : t('debug.emailDetail.false')}</div>
                    <div>{t('debug.emailDetail.followUpThreadSnoozeUntil')}: {followUpDebug.thread.snoozeUntil ?? t('debug.emailDetail.notAvailable')}</div>
                    <div>{t('debug.emailDetail.followUpLastUserOperationAt')}: {followUpDebug.thread.lastUserOperationAt ?? t('debug.emailDetail.notAvailable')}</div>
                  </>
                ) : (
                  <div>{t('debug.emailDetail.notAvailable')}</div>
                )}
              </div>
              <div style={{ ...threadEntryBoxStyle, marginTop: theme.spacing.sm }}>
                <strong>{t('debug.emailDetail.followUpReplyHistorySection')}</strong>
                <div>{t('debug.emailDetail.followUpUserSentLast')}: {followUpDebug.replyHistory.userSentLast ? t('debug.emailDetail.true') : t('debug.emailDetail.false')}</div>
                <div>{t('debug.emailDetail.followUpReplyReceived')}: {followUpDebug.replyHistory.replyReceived ? t('debug.emailDetail.true') : t('debug.emailDetail.false')}</div>
                <div>{t('debug.emailDetail.followUpLastMyReplyAt')}: {followUpDebug.replyHistory.lastMyReplyAt ?? t('debug.emailDetail.notAvailable')}</div>
                <div>{t('debug.emailDetail.followUpLastTheirReplyAt')}: {followUpDebug.replyHistory.lastTheirReplyAt ?? t('debug.emailDetail.notAvailable')}</div>
              </div>
              <div style={{ ...threadEntryBoxStyle, marginTop: theme.spacing.sm }}>
                <strong>{t('debug.emailDetail.followUpRecordsSection')}</strong>
                <div>{t('debug.emailDetail.followUpActiveDueAt')}: {followUpDebug.activeFollowUpDueAt ?? t('debug.emailDetail.notAvailable')}</div>
                {followUpDebug.followUpRecords.length === 0 ? (
                  <div>{t('debug.emailDetail.followUpNoRecords')}</div>
                ) : (
                  followUpDebug.followUpRecords.map((rec, idx) => (
                    <div key={rec.id} style={{ marginLeft: theme.spacing.sm }}>
                      {t('debug.emailDetail.followUpRecordItem', {
                        idx,
                        status: rec.status,
                        dueAt: rec.followUpDueAt,
                        days: rec.followUpDays,
                        sentEmailId: rec.sentEmailId ?? t('debug.emailDetail.notAvailable'),
                      })}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
