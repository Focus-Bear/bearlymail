import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

const DEBUG_PANEL_LINE_HEIGHT = 1.6;
const DEBUG_PANEL_PREVIEW_LENGTH = 50;

interface ReplyDebugPanelProps {
  debugInfo?: {
    propEmailId?: string;
    emailObjectId?: string | null;
    threadIdUsedForFetch?: string | null;
    lastGeneratedForEmailId?: string | null;
    timestamp: string;
  } | null;
  currentEmailId?: string | null;
  currentEmailObjectId?: string | null;
  currentEmailThreadId?: string | null;
  replyOptions?: Array<{ label: string; text: string }> | null;
}

export const ReplyComposerDebugPanel: React.FC<ReplyDebugPanelProps> = ({
  debugInfo,
  currentEmailId,
  currentEmailObjectId,
  currentEmailThreadId,
  replyOptions,
}) => {
  const { t } = useTranslation();

  if (!debugInfo && !currentEmailId) {
    return null;
  }
  const idMatch = currentEmailId === currentEmailObjectId;
  const genForCurrent = debugInfo?.propEmailId === currentEmailId;
  return (
    <div
      style={{
        marginTop: theme.spacing.md,
        padding: theme.spacing.md,
        backgroundColor: theme.colors.warning.light,
        border: `1px solid ${theme.colors.warning.main}`,
        borderRadius: theme.borderRadius.md,
        fontSize: theme.typography.fontSize.xs,
        fontFamily: 'monospace',
      }}
    >
      <div style={{ fontWeight: 'bold', marginBottom: theme.spacing.xs, color: theme.colors.warning.main }}>
        {t('debug.replyComposer.title')}
      </div>
      <div style={{ color: theme.colors.text.secondary, lineHeight: DEBUG_PANEL_LINE_HEIGHT }}>
        <div>
          <strong>{t('debug.replyComposer.currentState')}:</strong>
        </div>
        <div style={{ marginLeft: theme.spacing.md }}>
          <div>
            {t('debug.replyComposer.propEmailId')}: {currentEmailId || t('debug.replyComposer.notAvailable')}
          </div>
          <div>
            {t('debug.replyComposer.emailObjectId')}: {currentEmailObjectId || t('debug.replyComposer.notAvailable')}
          </div>
          <div>
            {t('debug.replyComposer.emailThreadId')}: {currentEmailThreadId || t('debug.replyComposer.notAvailable')}
          </div>
          <div
            style={{
              backgroundColor: idMatch ? theme.colors.success.light : theme.colors.error.light,
              padding: '2px 4px',
              borderRadius: '2px',
              display: 'inline-block',
            }}
          >
            {t('debug.replyComposer.idMatch')}:{' '}
            {idMatch ? t('debug.replyComposer.idMatchYes') : t('debug.replyComposer.idMatchNo')}
          </div>
        </div>
        {debugInfo && (
          <>
            <div style={{ marginTop: theme.spacing.sm }}>
              <strong>{t('debug.replyComposer.generationDebug')}:</strong>
            </div>
            <div style={{ marginLeft: theme.spacing.md }}>
              <div>
                {t('debug.replyComposer.generatedForEmailId')}: {debugInfo.propEmailId}
              </div>
              <div>
                {t('debug.replyComposer.emailObjectIdAtGeneration')}:{' '}
                {debugInfo.emailObjectId || t('debug.replyComposer.notAvailable')}
              </div>
              <div>
                {t('debug.replyComposer.threadIdUsedForFetch')}:{' '}
                {debugInfo.threadIdUsedForFetch || t('debug.replyComposer.notAvailable')}
              </div>
              <div>
                {t('debug.replyComposer.lastGeneratedFor')}:{' '}
                {debugInfo.lastGeneratedForEmailId || t('debug.replyComposer.notAvailable')}
              </div>
              <div>
                {t('debug.replyComposer.timestamp')}: {debugInfo.timestamp}
              </div>
              <div
                style={{
                  backgroundColor: genForCurrent ? theme.colors.success.light : theme.colors.error.light,
                  padding: '2px 4px',
                  borderRadius: '2px',
                  display: 'inline-block',
                  marginTop: '4px',
                }}
              >
                {t('debug.replyComposer.generatedForCurrent')}:{' '}
                {genForCurrent
                  ? t('debug.replyComposer.generatedForCurrentYes')
                  : t('debug.replyComposer.generatedForCurrentNo')}
              </div>
            </div>
          </>
        )}
        {replyOptions && replyOptions.length > 0 && (
          <>
            <div style={{ marginTop: theme.spacing.sm }}>
              <strong>{t('debug.replyComposer.replyOptions', { count: replyOptions.length })}:</strong>
            </div>
            <div style={{ marginLeft: theme.spacing.md }}>
              {replyOptions.map((opt, idx) => (
                <div key={idx}>
                  [{idx}] {opt.label}: {opt.text.substring(0, DEBUG_PANEL_PREVIEW_LENGTH)}...
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
