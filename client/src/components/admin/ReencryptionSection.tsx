import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';

import { API_URL } from 'config/api';

interface ReencryptionStatus {
  migratedUsers: number;
  pendingUsers: number;
  totalUsers: number;
  tablesInScope: string[];
}

interface DryRunTableResult {
  table: string;
  rowsScanned: number;
  rowsRewritten: number;
  rowsAlreadyMigrated: number;
  rowsFailed: number;
}

interface DryRunResult {
  userId: string;
  dryRun: boolean;
  tables: DryRunTableResult[];
}

const REENCRYPTION_BASE = `${API_URL}/admin/reencryption`;

export const ReencryptionSection: React.FC = () => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<ReencryptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<string | null>(null);
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const { data } = await axios.get<ReencryptionStatus>(
        `${REENCRYPTION_BASE}/status`,
        { withCredentials: true },
      );
      setStatus(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const runAction = useCallback(
    async (
      label: string,
      operation: () => Promise<string>,
    ): Promise<void> => {
      setActionInFlight(label);
      setActionResult(null);
      setDryRunResult(null);
      try {
        const message = await operation();
        setActionResult(message);
        await refreshStatus();
      } catch (err) {
        setActionResult(
          `Error: ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        setActionInFlight(null);
      }
    },
    [refreshStatus],
  );

  const handleDryRunSelf = () =>
    runAction(t('admin.reencryption.actions.dryRunSelf'), async () => {
      const { data } = await axios.post<DryRunResult>(
        `${REENCRYPTION_BASE}/dry-run-self`,
        {},
        { withCredentials: true },
      );
      setDryRunResult(data);
      return t('admin.reencryption.dryRunComplete');
    });

  const handleStartDryRunAll = () =>
    runAction(t('admin.reencryption.actions.startDryRunAll'), async () => {
      const { data } = await axios.post<{ enqueued: number }>(
        `${REENCRYPTION_BASE}/start`,
        { dryRun: true },
        { withCredentials: true },
      );
      return t('admin.reencryption.enqueued', { count: data.enqueued });
    });

  const handleStartAll = () =>
    runAction(t('admin.reencryption.actions.startAll'), async () => {
      if (!window.confirm(t('admin.reencryption.startAllConfirm'))) {
        throw new Error(t('admin.reencryption.cancelled'));
      }
      const { data } = await axios.post<{ enqueued: number }>(
        `${REENCRYPTION_BASE}/start`,
        { dryRun: false },
        { withCredentials: true },
      );
      return t('admin.reencryption.enqueued', { count: data.enqueued });
    });

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: theme.spacing['3xl'] }}>
        {t('admin.dashboard.loading')}
      </div>
    );
  }

  return (
    <div>
      <h2
        style={{
          margin: 0,
          marginBottom: theme.spacing.md,
          fontSize: theme.typography.fontSize['2xl'],
          fontWeight: theme.typography.fontWeight.bold,
          color: theme.colors.text.primary,
        }}
      >
        {t('admin.reencryption.title')}
      </h2>
      <p
        style={{
          color: theme.colors.text.secondary,
          marginBottom: theme.spacing.lg,
          maxWidth: 720,
        }}
      >
        {t('admin.reencryption.description')}
      </p>

      {error && (
        <div
          role="alert"
          style={{
            padding: theme.spacing.md,
            marginBottom: theme.spacing.lg,
            backgroundColor: theme.colors.error.light,
            color: theme.colors.error.main,
            borderRadius: 4,
          }}
        >
          {error}
        </div>
      )}

      {status && (
        <div
          style={{
            display: 'flex',
            gap: theme.spacing.lg,
            marginBottom: theme.spacing.lg,
          }}
        >
          <StatusCard
            label={t('admin.reencryption.migratedUsers')}
            value={status.migratedUsers}
            tone="success"
          />
          <StatusCard
            label={t('admin.reencryption.pendingUsers')}
            value={status.pendingUsers}
            tone="warning"
          />
          <StatusCard
            label={t('admin.reencryption.totalUsers')}
            value={status.totalUsers}
            tone="neutral"
          />
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: theme.spacing.md,
          marginBottom: theme.spacing.lg,
          flexWrap: 'wrap',
        }}
      >
        <ActionButton
          label={t('admin.reencryption.actions.dryRunSelf')}
          tone="primary"
          disabled={actionInFlight !== null}
          inFlight={
            actionInFlight === t('admin.reencryption.actions.dryRunSelf')
          }
          onClick={handleDryRunSelf}
        />
        <ActionButton
          label={t('admin.reencryption.actions.startDryRunAll')}
          tone="primary"
          disabled={actionInFlight !== null}
          inFlight={
            actionInFlight === t('admin.reencryption.actions.startDryRunAll')
          }
          onClick={handleStartDryRunAll}
        />
        <ActionButton
          label={t('admin.reencryption.actions.startAll')}
          tone="danger"
          disabled={actionInFlight !== null || status?.pendingUsers === 0}
          inFlight={actionInFlight === t('admin.reencryption.actions.startAll')}
          onClick={handleStartAll}
        />
      </div>

      {actionResult && (
        <div
          role="status"
          style={{
            padding: theme.spacing.md,
            marginBottom: theme.spacing.lg,
            backgroundColor: actionResult.startsWith('Error:')
              ? theme.colors.error.light
              : theme.colors.success.light,
            color: actionResult.startsWith('Error:')
              ? theme.colors.error.main
              : theme.colors.success.main,
            borderRadius: 4,
          }}
        >
          {actionResult}
        </div>
      )}

      {dryRunResult && (
        <DryRunResultTable
          result={dryRunResult}
          title={t('admin.reencryption.dryRunResultsTitle')}
          headers={{
            table: t('admin.reencryption.columns.table'),
            scanned: t('admin.reencryption.columns.scanned'),
            rewritten: t('admin.reencryption.columns.rewritten'),
            alreadyMigrated: t('admin.reencryption.columns.alreadyMigrated'),
            failed: t('admin.reencryption.columns.failed'),
          }}
        />
      )}

      {status && (
        <div style={{ marginTop: theme.spacing.xl }}>
          <h3
            style={{
              fontSize: theme.typography.fontSize.lg,
              fontWeight: theme.typography.fontWeight.semibold,
              marginBottom: theme.spacing.sm,
            }}
          >
            {t('admin.reencryption.tablesInScope')}
          </h3>
          <p
            style={{
              fontSize: theme.typography.fontSize.sm,
              color: theme.colors.text.secondary,
            }}
          >
            {status.tablesInScope.join(', ')}
          </p>
        </div>
      )}
    </div>
  );
};

interface StatusCardProps {
  label: string;
  value: number;
  tone: 'success' | 'warning' | 'neutral';
}

const StatusCard: React.FC<StatusCardProps> = ({ label, value, tone }) => {
  const colors = {
    success: theme.colors.success.main,
    warning: theme.colors.warning.main,
    neutral: theme.colors.text.primary,
  };
  return (
    <div
      style={{
        flex: 1,
        padding: theme.spacing.lg,
        backgroundColor: theme.colors.background.paper,
        border: `1px solid ${theme.colors.border.light}`,
        borderRadius: 6,
      }}
    >
      <div
        style={{
          fontSize: theme.typography.fontSize.sm,
          color: theme.colors.text.secondary,
          marginBottom: theme.spacing.xs,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: theme.typography.fontSize['3xl'],
          fontWeight: theme.typography.fontWeight.bold,
          color: colors[tone],
        }}
      >
        {value}
      </div>
    </div>
  );
};

const TONE_PRIMARY = 'primary' as const;
const TONE_DANGER = 'danger' as const;
type ButtonTone = typeof TONE_PRIMARY | typeof TONE_DANGER;

interface ActionButtonProps {
  label: string;
  tone: ButtonTone;
  disabled: boolean;
  inFlight: boolean;
  onClick: () => void;
}

const ActionButton: React.FC<ActionButtonProps> = ({
  label,
  tone,
  disabled,
  inFlight,
  onClick,
}) => {
  const bg =
    tone === TONE_DANGER
      ? theme.colors.error.main
      : theme.colors.primary.main;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        padding: `${theme.spacing.md} ${theme.spacing.lg}`,
        backgroundColor: disabled ? theme.colors.text.disabled : bg,
        color: theme.colors.common.white,
        border: 'none',
        borderRadius: 4,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontWeight: theme.typography.fontWeight.semibold,
      }}
    >
      {inFlight ? `${label}…` : label}
    </button>
  );
};

interface DryRunResultTableProps {
  result: DryRunResult;
  title: string;
  headers: {
    table: string;
    scanned: string;
    rewritten: string;
    alreadyMigrated: string;
    failed: string;
  };
}

const DryRunResultTable: React.FC<DryRunResultTableProps> = ({
  result,
  title,
  headers,
}) => (
  <div style={{ marginTop: theme.spacing.lg }}>
    <h3
      style={{
        fontSize: theme.typography.fontSize.lg,
        fontWeight: theme.typography.fontWeight.semibold,
        marginBottom: theme.spacing.sm,
      }}
    >
      {title}
    </h3>
    <table
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: theme.typography.fontSize.sm,
      }}
    >
      <thead>
        <tr style={{ borderBottom: `1px solid ${theme.colors.border.light}` }}>
          <th style={{ textAlign: 'left', padding: theme.spacing.sm }}>
            {headers.table}
          </th>
          <th style={{ textAlign: 'right', padding: theme.spacing.sm }}>
            {headers.scanned}
          </th>
          <th style={{ textAlign: 'right', padding: theme.spacing.sm }}>
            {headers.rewritten}
          </th>
          <th style={{ textAlign: 'right', padding: theme.spacing.sm }}>
            {headers.alreadyMigrated}
          </th>
          <th style={{ textAlign: 'right', padding: theme.spacing.sm }}>
            {headers.failed}
          </th>
        </tr>
      </thead>
      <tbody>
        {result.tables.map((row) => (
          <tr
            key={row.table}
            style={{
              borderBottom: `1px solid ${theme.colors.border.light}`,
            }}
          >
            <td style={{ padding: theme.spacing.sm }}>{row.table}</td>
            <td style={{ textAlign: 'right', padding: theme.spacing.sm }}>
              {row.rowsScanned}
            </td>
            <td style={{ textAlign: 'right', padding: theme.spacing.sm }}>
              {row.rowsRewritten}
            </td>
            <td style={{ textAlign: 'right', padding: theme.spacing.sm }}>
              {row.rowsAlreadyMigrated}
            </td>
            <td
              style={{
                textAlign: 'right',
                padding: theme.spacing.sm,
                color:
                  row.rowsFailed > 0
                    ? theme.colors.error.main
                    : theme.colors.text.primary,
              }}
            >
              {row.rowsFailed}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
