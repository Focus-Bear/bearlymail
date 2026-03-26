import React from 'react';
import { theme } from 'theme/theme';

import { WorkflowExecutionLog } from './types';

interface WorkflowExecutionHistoryProps {
  logs: WorkflowExecutionLog[];
  loading?: boolean;
}

const STATUS_COLORS: Record<WorkflowExecutionLog['status'], { bg: string; color: string }> = {
  success: { bg: '#d4edda', color: '#155724' },
  partial_failure: { bg: '#fff3cd', color: '#856404' },
  failed: { bg: '#f8d7da', color: '#721c24' },
  running: { bg: '#d1ecf1', color: '#0c5460' },
  pending: { bg: '#e2e3e5', color: '#383d41' },
};

/**
 * Shows recent execution logs for a workflow rule.
 * Part of feature #1483 — Automated Email Workflows.
 */
export const WorkflowExecutionHistory: React.FC<WorkflowExecutionHistoryProps> = ({
  logs,
  loading,
}) => {
  if (loading) {
    return <p style={{ color: theme.colors.text.secondary, fontSize: 13 }}>Loading execution history…</p>;
  }

  if (logs.length === 0) {
    return <p style={{ color: theme.colors.text.secondary, fontSize: 13 }}>No executions yet.</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {logs.map((log) => {
        const colors = STATUS_COLORS[log.status] ?? STATUS_COLORS.pending;
        return (
          <div
            key={log.id}
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              background: theme.colors.background.subtle,
              border: `1px solid ${theme.colors.border.default}`,
              fontSize: 13,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>
                Thread:{' '}
                <code style={{ fontSize: 12 }}>{log.emailThreadId.slice(0, 8)}…</code>
              </span>
              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: 12,
                  fontSize: 11,
                  fontWeight: 600,
                  background: colors.bg,
                  color: colors.color,
                }}
              >
                {log.status.replace('_', ' ')}
              </span>
            </div>
            <div style={{ color: theme.colors.text.secondary, marginTop: 4 }}>
              {new Date(log.executedAt).toLocaleString()}
            </div>
            {log.actionResults && log.actionResults.some((result) => result.status === 'failed') && (
              <details style={{ marginTop: 6 }}>
                <summary style={{ cursor: 'pointer', fontSize: 12, color: theme.colors.error.dark }}>
                  Failed actions
                </summary>
                <ul style={{ margin: '4px 0 0 0', paddingLeft: 16 }}>
                  {log.actionResults
                    .filter((result) => result.status === 'failed')
                    .map((result, idx) => (
                      <li key={idx} style={{ fontSize: 12, color: theme.colors.error.dark }}>
                        Action {result.actionIndex + 1}: {result.error}
                      </li>
                    ))}
                </ul>
              </details>
            )}
          </div>
        );
      })}
    </div>
  );
};
