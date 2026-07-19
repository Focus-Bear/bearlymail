import React from 'react';
import { theme } from 'theme/theme';
import { SummaryDebugInfo } from 'types/email';

/**
 * Admin-only diagnostic panel: lists exactly which thread emails were fed to
 * the LLM for the current summary. Reveals whether the most-recent messages
 * were included (used to debug "summary stuck on the first email").
 */
export const SummaryDebugPanel: React.FC<{ debug: SummaryDebugInfo }> = ({ debug }) => {
  // Literals are built into strings (not inline JSX text) to satisfy the
  // i18next/no-literal-string lint rule — this is admin-only diagnostic text.
  const plural = debug.totalThreadEmails === 1 ? '' : 's';
  const headerText = `🐞 Debug — summarised ${debug.usedEmailIds.length} of ${debug.totalThreadEmails} thread email${plural}`;
  const threadLine = `threadId: ${debug.threadId}`;
  const unknownSender = '(unknown sender)';
  return (
    <div
      style={{
        marginTop: theme.spacing.md,
        paddingTop: theme.spacing.sm,
        borderTop: `1px dashed ${theme.colors.border.medium}`,
        fontSize: theme.typography.fontSize.sm,
        color: theme.colors.text.secondary,
      }}
    >
      <div style={{ fontWeight: theme.typography.fontWeight.semibold, marginBottom: theme.spacing.xs }}>{headerText}</div>
      <div style={{ marginBottom: theme.spacing.xs, wordBreak: 'break-all' }}>{threadLine}</div>
      <ol style={{ margin: 0, paddingLeft: theme.spacing.lg, display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {debug.usedMessages.map(message => {
          const when = new Date(message.receivedAt).toLocaleString();
          const line = `${when} — ${message.from || unknownSender} — ${message.id}`;
          return (
            <li key={message.id} style={{ wordBreak: 'break-all' }}>
              {line}
            </li>
          );
        })}
      </ol>
    </div>
  );
};
