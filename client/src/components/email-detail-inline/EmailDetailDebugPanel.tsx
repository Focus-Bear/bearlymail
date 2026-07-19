import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { FONT_WEIGHT_SEMIBOLD } from 'constants/numbers';

const GmailApiLabelsInfo: React.FC<{ gmailLabels: any; isMatch: boolean; hasLabelMapping: boolean }> = ({
  gmailLabels,
  isMatch,
  hasLabelMapping,
}) => {
  const { t } = useTranslation();
  return (
    <>
      <div style={{ marginTop: theme.spacing.xs }}>
        <strong>{t('debug.adminPanel.gmailLabels')}:</strong>
        <div style={{ marginLeft: theme.spacing.md, marginTop: theme.spacing.xs }}>
          <div>
            <strong>{t('debug.adminPanel.rawLabelIds')}:</strong>{' '}
            {gmailLabels.gmailLabels.labelIds ? JSON.stringify(gmailLabels.gmailLabels.labelIds) : '[]'}
          </div>
          <div>
            <strong>{t('debug.adminPanel.convertedNames')}:</strong>{' '}
            {gmailLabels.gmailLabels.labelNames ? JSON.stringify(gmailLabels.gmailLabels.labelNames) : '[]'}
          </div>
          <div>
            <strong>{t('debug.adminPanel.count')}:</strong> {gmailLabels.gmailLabels.labelIds?.length || 0}
          </div>
        </div>
      </div>
      {hasLabelMapping && (
        <div style={{ marginTop: theme.spacing.xs }}>
          <strong>{t('debug.adminPanel.labelMapping')}:</strong>
          <div
            style={{
              marginLeft: theme.spacing.md,
              marginTop: theme.spacing.xs,
              fontSize: theme.typography.fontSize.xs,
            }}
          >
            {gmailLabels.labelMapping.map((mapping: any) => (
              <div key={mapping.id}>
                {mapping.id} → {mapping.name}
              </div>
            ))}
          </div>
        </div>
      )}
      {gmailLabels.gmailLabels.error && (
        <div style={{ color: theme.colors.error.main }}>
          <strong>{t('debug.adminPanel.gmailError')}:</strong> {gmailLabels.gmailLabels.error}
        </div>
      )}
      <div
        style={{
          marginTop: theme.spacing.xs,
          padding: theme.spacing.xs,
          backgroundColor: isMatch ? theme.colors.success.light : theme.colors.error.light,
          borderRadius: theme.borderRadius.sm,
        }}
      >
        <strong>{t('debug.adminPanel.matchStatus')}:</strong>{' '}
        {isMatch ? t('debug.adminPanel.match') : t('debug.adminPanel.mismatch')}
      </div>
    </>
  );
};

const AdminDebugGmailLabels: React.FC<{ gmailLabels: any; emailData: any; loadingLabels: boolean }> = ({
  gmailLabels,
  emailData,
  loadingLabels,
}) => {
  const { t } = useTranslation();
  const dbLabelsRaw = gmailLabels?.dbLabels?.raw
    ? JSON.stringify(gmailLabels.dbLabels.raw)
    : JSON.stringify(emailData.labels ?? []);
  const dbLabelsNames = gmailLabels?.dbLabels?.names
    ? JSON.stringify(gmailLabels.dbLabels.names)
    : JSON.stringify(emailData.labels ?? []);
  const dbLabelsCount = gmailLabels?.dbLabels?.names?.length || emailData.labels?.length || 0;
  const hasGmailLabels = gmailLabels && gmailLabels.gmailLabels;
  const hasLabelMapping = !!(gmailLabels?.labelMapping && gmailLabels.labelMapping.length > 0);
  const dbNames = gmailLabels?.dbLabels?.names || emailData.labels || [];
  const gmailNames = hasGmailLabels ? gmailLabels.gmailLabels.labelNames || [] : [];
  const isMatch = hasGmailLabels && JSON.stringify(dbNames) === JSON.stringify(gmailNames);

  return (
    <div style={{ marginLeft: theme.spacing.md, marginTop: theme.spacing.xs }}>
      <div>
        <strong>{t('debug.adminPanel.emailIdRef')}:</strong> {emailData.id}
      </div>
      <div>
        <strong>{t('debug.adminPanel.messageIdGmail')}:</strong>{' '}
        {emailData.messageId || t('debug.adminPanel.notAvailable')}
      </div>
      <div style={{ marginTop: theme.spacing.xs }}>
        <strong>{t('debug.adminPanel.dbLabels')}:</strong>
        <div style={{ marginLeft: theme.spacing.md, marginTop: theme.spacing.xs }}>
          <div>
            <strong>{t('debug.adminPanel.rawDb')}:</strong> {dbLabelsRaw}
          </div>
          <div>
            <strong>{t('debug.adminPanel.namesConverted')}:</strong> {dbLabelsNames}
          </div>
          <div>
            <strong>{t('debug.adminPanel.count')}:</strong> {dbLabelsCount}
          </div>
        </div>
      </div>
      {loadingLabels && <div>{t('debug.adminPanel.loadingGmailLabels')}</div>}
      {hasGmailLabels && (
        <GmailApiLabelsInfo gmailLabels={gmailLabels} isMatch={!!isMatch} hasLabelMapping={hasLabelMapping} />
      )}
      {gmailLabels?.error && (
        <div style={{ color: theme.colors.error.main }}>
          <strong>{t('debug.adminPanel.error')}:</strong> {gmailLabels.error}
        </div>
      )}
    </div>
  );
};

export const AdminDebugPanel: React.FC<{
  emailData: any;
  gmailLabels: any;
  gmailStarStatus: any;
  loadingLabels: boolean;
  loadingStarStatus: boolean;
}> = ({ emailData, gmailLabels, gmailStarStatus, loadingLabels, loadingStarStatus }) => {
  const { t } = useTranslation();
  const starCountDisplay =
    gmailStarStatus?.dbStarCount ?? (loadingStarStatus ? t('debug.stats.loading') : t('debug.adminPanel.notAvailable'));
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
          fontWeight: FONT_WEIGHT_SEMIBOLD,
          color: theme.colors.text.primary,
        }}
      >
        {t('debug.adminPanel.title')}
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
          <strong>{t('debug.adminPanel.emailId')}:</strong> {emailData.id}
        </div>
        <div>
          <strong>{t('debug.adminPanel.threadId')}:</strong> {emailData.threadId || t('debug.adminPanel.notAvailable')}
        </div>
        <div>
          <strong>{t('debug.adminPanel.emailThreadId')}:</strong>{' '}
          {emailData.emailThreadId || t('debug.adminPanel.notAvailable')}
        </div>
        <div>
          <strong>{t('debug.adminPanel.messageId')}:</strong>{' '}
          {emailData.messageId || t('debug.adminPanel.notAvailable')}
        </div>
        <div>
          <strong>{t('debug.adminPanel.attachments')}:</strong>{' '}
          {Array.isArray(emailData.attachments) && emailData.attachments.length > 0
            ? `${emailData.attachments.length} (${emailData.attachments
                .map((attachment: { filename?: string }) => attachment.filename || '?')
                .join(', ')})`
            : t('debug.adminPanel.attachmentsNone')}
        </div>
        <div
          style={{
            marginTop: theme.spacing.md,
            paddingTop: theme.spacing.md,
            borderTop: `1px solid ${theme.colors.border.light}`,
          }}
        >
          <strong>{t('debug.adminPanel.labels')}:</strong>
          <AdminDebugGmailLabels gmailLabels={gmailLabels} emailData={emailData} loadingLabels={loadingLabels} />
        </div>
        <div>
          <strong>{t('debug.adminPanel.receivedAt')}:</strong> {emailData.receivedAt}
        </div>
        <div>
          <strong>{t('debug.adminPanel.isRead')}:</strong>{' '}
          {emailData.isRead ? t('debug.adminPanel.true') : t('debug.adminPanel.false')}
        </div>
        <div>
          <strong>{t('debug.adminPanel.isArchived')}:</strong>{' '}
          {emailData.isArchived ? t('debug.adminPanel.true') : t('debug.adminPanel.false')}
        </div>
        <div
          style={{
            marginTop: theme.spacing.md,
            paddingTop: theme.spacing.md,
            borderTop: `1px solid ${theme.colors.border.light}`,
          }}
        >
          <strong>{t('debug.adminPanel.starStatus')}:</strong>
          <div style={{ marginLeft: theme.spacing.md, marginTop: theme.spacing.xs }}>
            <div>
              <strong>{t('debug.adminPanel.dbStarCount')}:</strong> {starCountDisplay}
            </div>
            <div>
              <strong>{t('debug.adminPanel.starCountField')}:</strong> {emailData.starCount || 0}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
