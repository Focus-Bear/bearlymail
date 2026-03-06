import React from 'react';
import { theme } from 'theme/theme';

import { FONT_WEIGHT_SEMIBOLD } from 'constants/numbers';

const GmailApiLabelsInfo: React.FC<{ gmailLabels: any; isMatch: boolean; hasLabelMapping: boolean }> = ({
  gmailLabels, isMatch, hasLabelMapping,
}) => (
  <>
    <div style={{ marginTop: theme.spacing.xs }}>
      <strong>Gmail Labels (from API):</strong>
      <div style={{ marginLeft: theme.spacing.md, marginTop: theme.spacing.xs }}>
        <div><strong>Raw Label IDs:</strong> {gmailLabels.gmailLabels.labelIds ? JSON.stringify(gmailLabels.gmailLabels.labelIds) : '[]'}</div>
        <div><strong>Converted Names:</strong> {gmailLabels.gmailLabels.labelNames ? JSON.stringify(gmailLabels.gmailLabels.labelNames) : '[]'}</div>
        <div><strong>Count:</strong> {gmailLabels.gmailLabels.labelIds?.length || 0}</div>
      </div>
    </div>
    {hasLabelMapping && (
      <div style={{ marginTop: theme.spacing.xs }}>
        <strong>Label Mapping (ID → Name):</strong>
        <div style={{ marginLeft: theme.spacing.md, marginTop: theme.spacing.xs, fontSize: theme.typography.fontSize.xs }}>
          {gmailLabels.labelMapping.map((mapping: any) => (<div key={mapping.id}>{mapping.id} → {mapping.name}</div>))}
        </div>
      </div>
    )}
    {gmailLabels.gmailLabels.error && (<div style={{ color: theme.colors.error.main }}><strong>Gmail Error:</strong> {gmailLabels.gmailLabels.error}</div>)}
    <div style={{ marginTop: theme.spacing.xs, padding: theme.spacing.xs, backgroundColor: isMatch ? theme.colors.success.light : theme.colors.error.light, borderRadius: theme.borderRadius.sm }}>
      <strong>Match Status:</strong> {isMatch ? '✓ MATCH' : '✗ MISMATCH'}
    </div>
  </>
);

const AdminDebugGmailLabels: React.FC<{ gmailLabels: any; emailData: any; loadingLabels: boolean }> = ({
  gmailLabels, emailData, loadingLabels,
}) => {
  const dbLabelsRaw = gmailLabels?.dbLabels?.raw ? JSON.stringify(gmailLabels.dbLabels.raw) : JSON.stringify(emailData.labels ?? []);
  const dbLabelsNames = gmailLabels?.dbLabels?.names ? JSON.stringify(gmailLabels.dbLabels.names) : JSON.stringify(emailData.labels ?? []);
  const dbLabelsCount = gmailLabels?.dbLabels?.names?.length || emailData.labels?.length || 0;
  const hasGmailLabels = gmailLabels && gmailLabels.gmailLabels;
  const hasLabelMapping = !!(gmailLabels?.labelMapping && gmailLabels.labelMapping.length > 0);
  const dbNames = gmailLabels?.dbLabels?.names || emailData.labels || [];
  const gmailNames = hasGmailLabels ? (gmailLabels.gmailLabels.labelNames || []) : [];
  const isMatch = hasGmailLabels && JSON.stringify(dbNames) === JSON.stringify(gmailNames);

  return (
    <div style={{ marginLeft: theme.spacing.md, marginTop: theme.spacing.xs }}>
      <div><strong>Email ID (for reference):</strong> {emailData.id}</div>
      <div><strong>Message ID (for Gmail lookup):</strong> {emailData.messageId || 'N/A'}</div>
      <div style={{ marginTop: theme.spacing.xs }}>
        <strong>DB Labels:</strong>
        <div style={{ marginLeft: theme.spacing.md, marginTop: theme.spacing.xs }}>
          <div><strong>Raw (stored in DB):</strong> {dbLabelsRaw}</div>
          <div><strong>Names (converted):</strong> {dbLabelsNames}</div>
          <div><strong>Count:</strong> {dbLabelsCount}</div>
        </div>
      </div>
      {loadingLabels && <div>Loading Gmail labels...</div>}
      {hasGmailLabels && <GmailApiLabelsInfo gmailLabels={gmailLabels} isMatch={!!isMatch} hasLabelMapping={hasLabelMapping} />}
      {gmailLabels?.error && (<div style={{ color: theme.colors.error.main }}><strong>Error:</strong> {gmailLabels.error}</div>)}
    </div>
  );
};

export const AdminDebugPanel: React.FC<{ emailData: any; gmailLabels: any; gmailStarStatus: any; loadingLabels: boolean; loadingStarStatus: boolean }> = ({
  emailData, gmailLabels, gmailStarStatus, loadingLabels, loadingStarStatus,
}) => {
  const starCountDisplay = gmailStarStatus?.dbStarCount ?? (loadingStarStatus ? 'loading...' : 'N/A');
  return (
    <div style={{ marginTop: theme.spacing.xl, padding: theme.spacing.lg, backgroundColor: theme.colors.background.subtle, borderRadius: theme.borderRadius.md, border: `1px solid ${theme.colors.border.light}` }}>
      <h3 style={{ marginTop: 0, marginBottom: theme.spacing.md, fontSize: theme.typography.fontSize.sm, fontWeight: FONT_WEIGHT_SEMIBOLD, color: theme.colors.text.primary }}>Debug Information (Admin Only)</h3>
      <div style={{ fontFamily: 'monospace', fontSize: theme.typography.fontSize.xs, color: theme.colors.text.secondary, lineHeight: 1.6 }}>
        <div><strong>Email ID:</strong> {emailData.id}</div>
        <div><strong>Thread ID:</strong> {emailData.threadId || 'N/A'}</div>
        <div><strong>Email Thread ID:</strong> {emailData.emailThreadId || 'N/A'}</div>
        <div><strong>Message ID:</strong> {emailData.messageId || 'N/A'}</div>
        <div style={{ marginTop: theme.spacing.md, paddingTop: theme.spacing.md, borderTop: `1px solid ${theme.colors.border.light}` }}>
          <strong>Labels:</strong>
          <AdminDebugGmailLabels gmailLabels={gmailLabels} emailData={emailData} loadingLabels={loadingLabels} />
        </div>
        <div><strong>Received At:</strong> {emailData.receivedAt}</div>
        <div><strong>Is Read:</strong> {emailData.isRead ? 'true' : 'false'}</div>
        <div><strong>Is Archived:</strong> {emailData.isArchived ? 'true' : 'false'}</div>
        <div style={{ marginTop: theme.spacing.md, paddingTop: theme.spacing.md, borderTop: `1px solid ${theme.colors.border.light}` }}>
          <strong>Star Status:</strong>
          <div style={{ marginLeft: theme.spacing.md, marginTop: theme.spacing.xs }}>
            <div><strong>DB Star Count (from thread):</strong> {starCountDisplay}</div>
            <div><strong>Star Count:</strong> {emailData.starCount || 0}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
