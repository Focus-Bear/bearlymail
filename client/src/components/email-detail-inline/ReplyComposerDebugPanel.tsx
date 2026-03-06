import React from 'react';
import { theme } from 'theme/theme';

const DEBUG_PANEL_LINE_HEIGHT = 1.6;
const DEBUG_PANEL_PREVIEW_LENGTH = 50;

interface ReplyDebugPanelProps {
  debugInfo?: { 
    propEmailId?: string; emailObjectId?: string | null; threadIdUsedForFetch?: string | null;
    lastGeneratedForEmailId?: string | null; timestamp: string;
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
  if (!debugInfo && !currentEmailId) return null;
  const idMatch = currentEmailId === currentEmailObjectId;
  const genForCurrent = debugInfo?.propEmailId === currentEmailId;
  return (
    <div style={{ marginTop: theme.spacing.md, padding: theme.spacing.md, backgroundColor: theme.colors.warning.light, border: `1px solid ${theme.colors.warning.main}`, borderRadius: theme.borderRadius.md, fontSize: theme.typography.fontSize.xs, fontFamily: 'monospace' }}>
      <div style={{ fontWeight: 'bold', marginBottom: theme.spacing.xs, color: theme.colors.warning.main }}>Reply Generation Debug (Admin Only)</div>
      <div style={{ color: theme.colors.text.secondary, lineHeight: DEBUG_PANEL_LINE_HEIGHT }}>
        <div><strong>Current State:</strong></div>
        <div style={{ marginLeft: theme.spacing.md }}>
          <div>Prop emailId: {currentEmailId || 'N/A'}</div>
          <div>Email object ID: {currentEmailObjectId || 'N/A'}</div>
          <div>Email threadId: {currentEmailThreadId || 'N/A'}</div>
          <div style={{ backgroundColor: idMatch ? theme.colors.success.light : theme.colors.error.light, padding: '2px 4px', borderRadius: '2px', display: 'inline-block' }}>
            ID Match: {idMatch ? 'YES' : 'NO - MISMATCH!'}
          </div>
        </div>
        {debugInfo && (
          <>
            <div style={{ marginTop: theme.spacing.sm }}><strong>Generation Debug Info:</strong></div>
            <div style={{ marginLeft: theme.spacing.md }}>
              <div>Generated for emailId: {debugInfo.propEmailId}</div>
              <div>Email object ID at generation: {debugInfo.emailObjectId || 'N/A'}</div>
              <div>Thread ID used for fetch: {debugInfo.threadIdUsedForFetch || 'N/A'}</div>
              <div>Last generated for: {debugInfo.lastGeneratedForEmailId || 'N/A'}</div>
              <div>Timestamp: {debugInfo.timestamp}</div>
              <div style={{ backgroundColor: genForCurrent ? theme.colors.success.light : theme.colors.error.light, padding: '2px 4px', borderRadius: '2px', display: 'inline-block', marginTop: '4px' }}>
                Generated for current email: {genForCurrent ? 'YES' : 'NO - STALE DATA!'}
              </div>
            </div>
          </>
        )}
        {replyOptions && replyOptions.length > 0 && (
          <>
            <div style={{ marginTop: theme.spacing.sm }}><strong>Reply Options ({replyOptions.length}):</strong></div>
            <div style={{ marginLeft: theme.spacing.md }}>
              {replyOptions.map((opt, idx) => (
                // eslint-disable-next-line react/no-array-index-key -- debug panel: options may share labels, index is only stable key
                <div key={idx}>[{idx}] {opt.label}: {opt.text.substring(0, DEBUG_PANEL_PREVIEW_LENGTH)}...</div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
