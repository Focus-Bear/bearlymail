import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { WorkflowExecutionLog } from './types';

interface WorkflowExecutionHistoryProps {
  logs: WorkflowExecutionLog[];
  loading?: boolean;
}

const ACTION_RESULT_FAILED = 'failed';

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
export const WorkflowExecutionHistory: React.FC<WorkflowExecutionHistoryProps> = ({ logs, loading }) => {
  const { t } = useTranslation();

  if (loading) {
    return (
      <p style={{ color: theme.colors.text.secondary, fontSize: 13 }}>
        {t('settings.workflows.history.loadingExecutionHistory')}
      </p>
    );
  }

  if (logs.length === 0) {
    return (
      <p style={{ color: theme.colors.text.secondary, fontSize: 13 }}>
        {t('settings.workflows.history.noExecutionsYet')}
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {logs.map(log => {
        const colors = STATUS_COLORS[log.status] ?? STATUS_COLORS.pending;
        const statusLabels: Record<WorkflowExecutionLog['status'], string> = {
          success: t('settings.workflows.history.statusSuccess'),
          partial_failure: t('settings.workflows.history.statusPartialFailure'),
          failed: t('settings.workflows.history.statusFailed'),
          running: t('settings.workflows.history.statusRunning'),
          pending: t('settings.workflows.history.statusPending'),
        };
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
                {t('settings.workflows.history.threadLabel')}{' '}
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
                {statusLabels[log.status] ?? statusLabels.pending}
              </span>
            </div>
            <div style={{ color: theme.colors.text.secondary, marginTop: 4 }}>
              {new Date(log.executedAt).toLocaleString()}
            </div>
            {log.actionResults && log.actionResults.some(result => result.status === ACTION_RESULT_FAILED) && (
              <details style={{ marginTop: 6 }}>
                <summary style={{ cursor: 'pointer', fontSize: 12, color: theme.colors.error.dark }}>
                  {t('settings.workflows.history.failedActions')}
                </summary>
                <ul style={{ margin: '4px 0 0 0', paddingLeft: 16 }}>
                  {log.actionResults
                    .filter(result => result.status === ACTION_RESULT_FAILED)
                    .map((result, idx) => (
                      <li key={idx} style={{ fontSize: 12, color: theme.colors.error.dark }}>
                        {t('settings.workflows.history.actionError', {
                          index: result.actionIndex + 1,
                          error: result.error,
                        })}
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
