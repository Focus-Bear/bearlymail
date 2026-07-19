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

interface ColumnHealth {
  table: string;
  column: string;
  total: number;
  nonNull: number;
  encrypted: number;
  needsRemediation: number;
  pgArrayLiteral: number;
}

interface UserHealthEntry {
  userId: string;
  rowsNeedingRemediation: number;
}

/**
 * Truthful data-at-rest health from GET /admin/reencryption/health. Unlike the
 * `dataReencryptedAt` stamp (migrated/pending), this counts rows that actually
 * hold plaintext at rest — so a brand-new user with clean data scores zero.
 */
interface ReencryptionHealth {
  generatedAt: string;
  scannedTables: number;
  rowsNeedingRemediation: number;
  columnsAffected: number;
  byColumn: ColumnHealth[];
  topAffectedUsers: UserHealthEntry[];
  jobVisitedUsers: number;
  neverVisitedUsers: number;
  totalUsers: number;
}

interface DryRunTableResult {
  table: string;
  rowsScanned: number;
  rowsRewritten: number;
  rowsAlreadyMigrated: number;
  rowsFailed: number;
  // Optional for backwards compat with older server versions that don't
  // populate these yet (avoids client errors on first deploy).
  rowsCleared?: number;
  failures?: FailureDetail[];
}

interface DryRunResult {
  userId: string;
  dryRun: boolean;
  tables: DryRunTableResult[];
}

type JobState =
  | 'created'
  | 'retry'
  | 'active'
  | 'completed'
  | 'expired'
  | 'cancelled'
  | 'failed'
  | 'not_found';

interface FanoutResult {
  enqueued: number;
  dryRun: boolean;
  childJobIds: string[];
}

interface JobStatusResponse<TOutput> {
  state: JobState;
  output: TOutput | null;
}

interface FailureDetail {
  table: string;
  rowId: string;
  column: string;
  reason: 'neither_key' | 'encrypt_failed' | 'unknown';
  ivHexLen: number;
  tagHexLen: number;
  bodyHexLen: number;
  totalLen: number;
  prefix: string;
  suffix: string;
  errorMessage: string;
}

interface AggregatedTableSummary {
  table: string;
  rowsScanned: number;
  rowsRewritten: number;
  rowsAlreadyMigrated: number;
  rowsFailed: number;
  // Optional for backwards compat with older server versions.
  rowsCleared?: number;
}

interface ChildJobSummary {
  jobId: string;
  userId: string | null;
  state: JobState;
}

interface AggregatedFailureDetail extends FailureDetail {
  userId: string | null;
}

interface ChildJobError {
  jobId: string;
  userId: string | null;
  // Optional for backwards compat with the pre-2132-bulletproof server shape,
  // which only emitted `{ jobId, userId, message }` for FAILED children.
  state?: JobState;
  message: string;
  outputPreview?: string | null;
}

interface FanoutResultsResponse {
  state: JobState;
  childrenTotal: number;
  childrenTerminal: number;
  childrenCompleted: number;
  childrenFailed: number;
  usersWithRowFailures: number;
  tables: AggregatedTableSummary[];
  failures: AggregatedFailureDetail[];
  // Optional for backwards compat with older server versions that don't
  // populate it yet (avoids client errors on first deploy).
  childJobErrors?: ChildJobError[];
  children: ChildJobSummary[];
}

const REENCRYPTION_BASE = `${API_URL}/admin/reencryption`;
const JOB_POLL_INTERVAL_MS = 2000;
const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;
const JOB_POLL_TIMEOUT_MINUTES = 10;
const JOB_POLL_TIMEOUT_MS =
  JOB_POLL_TIMEOUT_MINUTES * SECONDS_PER_MINUTE * MS_PER_SECOND;
const JOB_STATE_COMPLETED: JobState = 'completed';
const JOB_STATE_FAILED: JobState = 'failed';
const TERMINAL_JOB_STATES: ReadonlySet<JobState> = new Set([
  JOB_STATE_COMPLETED,
  JOB_STATE_FAILED,
  'expired',
  'cancelled',
  'not_found',
]);

async function pollJobUntilTerminal<TOutput>(
  jobId: string,
  buildUrl: (id: string) => string = (id) => `${REENCRYPTION_BASE}/job/${id}`,
): Promise<JobStatusResponse<TOutput>> {
  const deadline = Date.now() + JOB_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const { data } = await axios.get<JobStatusResponse<TOutput>>(
      buildUrl(jobId),
      { withCredentials: true },
    );
    if (TERMINAL_JOB_STATES.has(data.state)) {
      return data;
    }
    await new Promise((resolve) => setTimeout(resolve, JOB_POLL_INTERVAL_MS));
  }
  throw new Error('Job did not complete within 10 minutes');
}

const CONTACT_TOKENS_BASE = `${API_URL}/contacts/admin`;
const CATEGORY_RULE_IDS_BASE = `${API_URL}/category-rules/admin`;

interface BackfillAllUsersResult {
  dryRun: boolean;
  totalUsers: number;
  succeededUsers: number;
  failedUsers: number;
  totalScanned: number;
  totalUpdated: number;
  totalEmpty: number;
}

interface BackfillCategoryRuleIdsResult {
  dryRun: boolean;
  totalUsers: number;
  succeededUsers: number;
  failedUsers: number;
  totalScanned: number;
  totalMatched: number;
  totalOrphaned: number;
}

/**
 * The "Start real run" button is enabled only when there's actually work to do:
 * plaintext-at-rest rows to remediate, OR users the job has never visited. While
 * the health scan is still loading (`null`), keep the button disabled — clicking
 * before health resolves would call `realRunForce(null) === false`, skipping
 * exactly the visited-but-plaintext rows that need remediation.
 */
export function shouldEnableRealRun(health: ReencryptionHealth | null): boolean {
  if (!health) {
    return false;
  }
  return health.rowsNeedingRemediation > 0 || health.neverVisitedUsers > 0;
}

/**
 * A real run must `force` a rescan of already-migrated users precisely when the
 * health scan found plaintext-at-rest rows — those users are stamped
 * `dataReencryptedAt`, so a non-forced run would skip exactly the rows that
 * need fixing. When the only work is never-visited users, no force is needed.
 */
export function realRunForce(health: ReencryptionHealth | null): boolean {
  return (health?.rowsNeedingRemediation ?? 0) > 0;
}

export const ReencryptionSection: React.FC = () => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<ReencryptionStatus | null>(null);
  const [health, setHealth] = useState<ReencryptionHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<string | null>(null);
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null);
  const [fanoutJobId, setFanoutJobId] = useState<string | null>(null);
  const [fanoutResults, setFanoutResults] =
    useState<FanoutResultsResponse | null>(null);

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

  // The data-at-rest health scan. Separate from /status because it does real
  // table scans (a few seconds) — we don't want it to block the initial render.
  const refreshHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      // Run the scan as a background job and poll: the per-column SQL scans
      // large tables (emails, email_threads) and exceeds the ALB idle timeout
      // if done synchronously, which left these cards stuck loading.
      const { data: enqueueResp } = await axios.post<{ jobId: string }>(
        `${REENCRYPTION_BASE}/health/scan`,
        {},
        { withCredentials: true },
      );
      if (!enqueueResp?.jobId) {
        throw new Error(
          t('admin.reencryption.health.scanFailed', {
            state: 'no_job_id',
          }),
        );
      }
      const finalStatus = await pollJobUntilTerminal<ReencryptionHealth>(
        enqueueResp.jobId,
      );
      if (finalStatus.state !== JOB_STATE_COMPLETED || !finalStatus.output) {
        throw new Error(
          t('admin.reencryption.health.scanFailed', {
            state: finalStatus.state,
          }),
        );
      }
      setHealth(finalStatus.output);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setHealthLoading(false);
    }
  }, [t]);

  useEffect(() => {
    refreshStatus();
    refreshHealth();
  }, [refreshStatus, refreshHealth]);

  const runAction = useCallback(
    async (
      label: string,
      operation: () => Promise<string>,
    ): Promise<void> => {
      setActionInFlight(label);
      setActionResult(null);
      setDryRunResult(null);
      setFanoutJobId(null);
      setFanoutResults(null);
      try {
        const message = await operation();
        setActionResult(message);
        await refreshStatus();
        await refreshHealth();
      } catch (err) {
        setActionResult(
          `Error: ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        setActionInFlight(null);
      }
    },
    [refreshStatus, refreshHealth],
  );

  const fetchFanoutResults = useCallback(
    async (jobId: string): Promise<FanoutResultsResponse> => {
      const { data } = await axios.get<FanoutResultsResponse>(
        `${REENCRYPTION_BASE}/fanout/${jobId}/results`,
        { withCredentials: true },
      );
      setFanoutResults(data);
      return data;
    },
    [],
  );

  // Once a fan-out completes we have its child job IDs, but those per-user
  // jobs are still running. Poll the aggregation endpoint until every child
  // is terminal so the admin sees results trickle in rather than nothing.
  useEffect(() => {
    if (!fanoutJobId) {
      return;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const results = await fetchFanoutResults(fanoutJobId);
        if (cancelled) {
          return;
        }
        // Clear any error from a previous transient failure now that polling
        // has recovered, so the UI doesn't stay stuck in an error state.
        setError(null);
        if (results.childrenTerminal < results.childrenTotal) {
          window.setTimeout(poll, JOB_POLL_INTERVAL_MS);
        }
      } catch (err) {
        if (cancelled) {
          return;
        }
        setError(err instanceof Error ? err.message : String(err));
        // Keep polling on transient failures (e.g. brief network blips) so
        // the UI recovers automatically once the endpoint responds again.
        window.setTimeout(poll, JOB_POLL_INTERVAL_MS);
      }
    };
    poll();
    return () => {
      cancelled = true;
    };
  }, [fanoutJobId, fetchFanoutResults]);

  const handleDryRunSelf = () =>
    runAction(t('admin.reencryption.actions.dryRunSelf'), async () => {
      const { data: enqueueResp } = await axios.post<{ jobId: string }>(
        `${REENCRYPTION_BASE}/dry-run-self`,
        {},
        { withCredentials: true },
      );
      const finalStatus = await pollJobUntilTerminal<DryRunResult>(
        enqueueResp.jobId,
      );
      if (finalStatus.state === JOB_STATE_FAILED) {
        throw new Error(t('admin.reencryption.dryRunFailed'));
      }
      if (finalStatus.state !== JOB_STATE_COMPLETED || !finalStatus.output) {
        throw new Error(
          t('admin.reencryption.dryRunNoResult', { state: finalStatus.state }),
        );
      }
      setDryRunResult(finalStatus.output);
      return t('admin.reencryption.dryRunComplete');
    });

  const handleStartDryRunAll = () =>
    runAction(t('admin.reencryption.actions.startDryRunAll'), () =>
      // Dry-run already scans every user server-side; force is redundant but
      // explicit so the preview always covers already-migrated users too.
      runFanout(true, true),
    );

  const handleStartAll = () =>
    runAction(t('admin.reencryption.actions.startAll'), async () => {
      if (!window.confirm(t('admin.reencryption.startAllConfirm'))) {
        throw new Error(t('admin.reencryption.cancelled'));
      }
      return runFanout(false, realRunForce(health));
    });

  async function runFanout(dryRun: boolean, force: boolean): Promise<string> {
    const { data: enqueueResp } = await axios.post<{ jobId: string }>(
      `${REENCRYPTION_BASE}/start`,
      { dryRun, force },
      { withCredentials: true },
    );
    const finalStatus = await pollJobUntilTerminal<FanoutResult>(
      enqueueResp.jobId,
    );
    if (finalStatus.state === JOB_STATE_FAILED) {
      throw new Error(t('admin.reencryption.fanoutFailed'));
    }
    if (finalStatus.state !== JOB_STATE_COMPLETED || !finalStatus.output) {
      throw new Error(
        t('admin.reencryption.fanoutNoResult', { state: finalStatus.state }),
      );
    }
    // Trigger the aggregation-polling useEffect so the per-user jobs'
    // results stream into the UI as they complete.
    setFanoutJobId(enqueueResp.jobId);
    return t('admin.reencryption.enqueued', {
      count: finalStatus.output.enqueued,
    });
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: theme.spacing['3xl'] }}>
        {t('admin.dashboard.loading')}
      </div>
    );
  }

  // Headline card values precomputed to keep the JSX free of nested ternaries.
  const healthValue = (value: number | undefined): number | string => {
    if (health) {
      return value ?? 0;
    }
    if (healthLoading) {
      return '…';
    }
    return '—';
  };
  let visitedDisplay = '—';
  if (health) {
    visitedDisplay = `${health.jobVisitedUsers}/${health.totalUsers}`;
  } else if (status) {
    visitedDisplay = `${status.migratedUsers}/${status.totalUsers}`;
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

      {/* Truthful data-at-rest health — the real signal. A value sitting in a
          column as plaintext (bypassed transformer) is what needs remediation;
          the job-visited stamp below is NOT a health indicator. */}
      <div
        style={{
          display: 'flex',
          gap: theme.spacing.lg,
          marginBottom: theme.spacing.lg,
          flexWrap: 'wrap',
        }}
      >
        <StatusCard
          label={t('admin.reencryption.health.rowsNeedingRemediation')}
          value={healthValue(health?.rowsNeedingRemediation)}
          tone={(health?.rowsNeedingRemediation ?? 0) > 0 ? 'error' : 'success'}
          hint={t('admin.reencryption.health.rowsNeedingRemediationHint')}
        />
        <StatusCard
          label={t('admin.reencryption.health.columnsAffected')}
          value={healthValue(health?.columnsAffected)}
          tone={(health?.columnsAffected ?? 0) > 0 ? 'warning' : 'neutral'}
        />
        <StatusCard
          label={t('admin.reencryption.health.jobVisitedUsers')}
          value={visitedDisplay}
          tone="neutral"
          hint={t('admin.reencryption.health.jobVisitedUsersHint')}
        />
      </div>

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
          // Enable when there's actually something to do: plaintext rows to
          // remediate (force rescan) OR users the job has never visited.
          disabled={actionInFlight !== null || !shouldEnableRealRun(health)}
          inFlight={actionInFlight === t('admin.reencryption.actions.startAll')}
          onClick={handleStartAll}
        />
        <ActionButton
          label={t('admin.reencryption.actions.refreshHealth')}
          tone="primary"
          disabled={actionInFlight !== null || healthLoading}
          inFlight={healthLoading}
          onClick={refreshHealth}
        />
      </div>

      {health && <HealthBreakdownSection health={health} />}

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
            cleared: t('admin.reencryption.columns.cleared'),
            failed: t('admin.reencryption.columns.failed'),
          }}
        />
      )}

      {dryRunResult?.tables && (
        <FailureDetailsSection
          failures={collectSelfDryRunFailures(dryRunResult)}
          showUserColumn={false}
        />
      )}

      {fanoutJobId && fanoutResults && (
        <FanoutAggregateSection
          results={fanoutResults}
          onRefresh={() => fetchFanoutResults(fanoutJobId)}
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

      <ContactTokenBackfillSubsection />
      <CategoryRuleIdBackfillSubsection />
    </div>
  );
};

const ContactTokenBackfillSubsection: React.FC = () => {
  const { t } = useTranslation();
  const [inFlight, setInFlight] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<BackfillAllUsersResult | null>(null);

  const run = useCallback(
    async (dryRun: boolean, label: string): Promise<void> => {
      if (!dryRun && !window.confirm(t('admin.reencryption.contactTokens.startConfirm'))) {
        setMessage(t('admin.reencryption.contactTokens.cancelled'));
        return;
      }
      setInFlight(label);
      setMessage(null);
      setResult(null);
      try {
        const { data: enqueueResp } = await axios.post<{ jobId: string }>(
          `${CONTACT_TOKENS_BASE}/backfill-search-tokens/start`,
          { dryRun },
          { withCredentials: true },
        );
        setMessage(
          t('admin.reencryption.contactTokens.enqueued', {
            jobId: enqueueResp.jobId,
          }),
        );
        const finalStatus = await pollJobUntilTerminal<BackfillAllUsersResult>(
          enqueueResp.jobId,
          (id) => `${CONTACT_TOKENS_BASE}/backfill-search-tokens/job/${id}`,
        );
        if (finalStatus.state === JOB_STATE_FAILED) {
          throw new Error(t('admin.reencryption.contactTokens.failed'));
        }
        if (finalStatus.state !== JOB_STATE_COMPLETED || !finalStatus.output) {
          throw new Error(
            t('admin.reencryption.contactTokens.noResult', {
              state: finalStatus.state,
            }),
          );
        }
        setResult(finalStatus.output);
        setMessage(t('admin.reencryption.contactTokens.complete'));
      } catch (err) {
        setMessage(
          `Error: ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        setInFlight(null);
      }
    },
    [t],
  );

  const dryRunLabel = t('admin.reencryption.contactTokens.actions.dryRun');
  const startLabel = t('admin.reencryption.contactTokens.actions.start');

  return (
    <div
      style={{
        marginTop: theme.spacing.xl,
        paddingTop: theme.spacing.xl,
        borderTop: `1px solid ${theme.colors.border.light}`,
      }}
    >
      <h2
        style={{
          margin: 0,
          marginBottom: theme.spacing.md,
          fontSize: theme.typography.fontSize['2xl'],
          fontWeight: theme.typography.fontWeight.bold,
          color: theme.colors.text.primary,
        }}
      >
        {t('admin.reencryption.contactTokens.title')}
      </h2>
      <p
        style={{
          color: theme.colors.text.secondary,
          marginBottom: theme.spacing.lg,
          maxWidth: 720,
        }}
      >
        {t('admin.reencryption.contactTokens.description')}
      </p>

      <div
        style={{
          display: 'flex',
          gap: theme.spacing.md,
          marginBottom: theme.spacing.lg,
          flexWrap: 'wrap',
        }}
      >
        <ActionButton
          label={dryRunLabel}
          tone="primary"
          disabled={inFlight !== null}
          inFlight={inFlight === dryRunLabel}
          onClick={() => run(true, dryRunLabel)}
        />
        <ActionButton
          label={startLabel}
          tone="danger"
          disabled={inFlight !== null}
          inFlight={inFlight === startLabel}
          onClick={() => run(false, startLabel)}
        />
      </div>

      {message && (
        <div
          role="status"
          style={{
            padding: theme.spacing.md,
            marginBottom: theme.spacing.lg,
            backgroundColor: message.startsWith('Error:')
              ? theme.colors.error.light
              : theme.colors.success.light,
            color: message.startsWith('Error:')
              ? theme.colors.error.main
              : theme.colors.success.main,
            borderRadius: 4,
          }}
        >
          {message}
        </div>
      )}

      {result && (
        <div style={{ marginTop: theme.spacing.lg }}>
          <h3
            style={{
              fontSize: theme.typography.fontSize.lg,
              fontWeight: theme.typography.fontWeight.semibold,
              marginBottom: theme.spacing.sm,
            }}
          >
            {t('admin.reencryption.contactTokens.resultTitle')}
            {result.dryRun
              ? ` ${t('admin.reencryption.contactTokens.dryRunBadge')}`
              : ''}
          </h3>
          <div
            style={{
              display: 'flex',
              gap: theme.spacing.lg,
              flexWrap: 'wrap',
            }}
          >
            <StatusCard
              label={t('admin.reencryption.contactTokens.columns.totalUsers')}
              value={result.totalUsers}
              tone="neutral"
            />
            <StatusCard
              label={t(
                'admin.reencryption.contactTokens.columns.succeededUsers',
              )}
              value={result.succeededUsers}
              tone="success"
            />
            <StatusCard
              label={t('admin.reencryption.contactTokens.columns.failedUsers')}
              value={result.failedUsers}
              tone={result.failedUsers > 0 ? 'warning' : 'neutral'}
            />
            <StatusCard
              label={t('admin.reencryption.contactTokens.columns.totalScanned')}
              value={result.totalScanned}
              tone="neutral"
            />
            <StatusCard
              label={t('admin.reencryption.contactTokens.columns.totalUpdated')}
              value={result.totalUpdated}
              tone="success"
            />
            <StatusCard
              label={t('admin.reencryption.contactTokens.columns.totalEmpty')}
              value={result.totalEmpty}
              tone={result.totalEmpty > 0 ? 'warning' : 'neutral'}
            />
          </div>
        </div>
      )}
    </div>
  );
};

const CategoryRuleIdBackfillSubsection: React.FC = () => {
  const { t } = useTranslation();
  const [inFlight, setInFlight] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<BackfillCategoryRuleIdsResult | null>(
    null,
  );

  const run = useCallback(
    async (dryRun: boolean, label: string): Promise<void> => {
      if (
        !dryRun &&
        !window.confirm(t('admin.reencryption.categoryRuleIds.startConfirm'))
      ) {
        setMessage(t('admin.reencryption.categoryRuleIds.cancelled'));
        return;
      }
      setInFlight(label);
      setMessage(null);
      setResult(null);
      try {
        const { data: enqueueResp } = await axios.post<{ jobId: string }>(
          `${CATEGORY_RULE_IDS_BASE}/backfill-ids/start`,
          { dryRun },
          { withCredentials: true },
        );
        setMessage(
          t('admin.reencryption.categoryRuleIds.enqueued', {
            jobId: enqueueResp.jobId,
          }),
        );
        const finalStatus =
          await pollJobUntilTerminal<BackfillCategoryRuleIdsResult>(
            enqueueResp.jobId,
            (id) => `${CATEGORY_RULE_IDS_BASE}/backfill-ids/job/${id}`,
          );
        if (finalStatus.state === JOB_STATE_FAILED) {
          throw new Error(t('admin.reencryption.categoryRuleIds.failed'));
        }
        if (finalStatus.state !== JOB_STATE_COMPLETED || !finalStatus.output) {
          throw new Error(
            t('admin.reencryption.categoryRuleIds.noResult', {
              state: finalStatus.state,
            }),
          );
        }
        setResult(finalStatus.output);
        setMessage(t('admin.reencryption.categoryRuleIds.complete'));
      } catch (err) {
        setMessage(
          `Error: ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        setInFlight(null);
      }
    },
    [t],
  );

  const dryRunLabel = t('admin.reencryption.categoryRuleIds.actions.dryRun');
  const startLabel = t('admin.reencryption.categoryRuleIds.actions.start');

  return (
    <div
      style={{
        marginTop: theme.spacing.xl,
        paddingTop: theme.spacing.xl,
        borderTop: `1px solid ${theme.colors.border.light}`,
      }}
    >
      <h2
        style={{
          margin: 0,
          marginBottom: theme.spacing.md,
          fontSize: theme.typography.fontSize['2xl'],
          fontWeight: theme.typography.fontWeight.bold,
          color: theme.colors.text.primary,
        }}
      >
        {t('admin.reencryption.categoryRuleIds.title')}
      </h2>
      <p
        style={{
          color: theme.colors.text.secondary,
          marginBottom: theme.spacing.lg,
          maxWidth: 720,
        }}
      >
        {t('admin.reencryption.categoryRuleIds.description')}
      </p>

      <div
        style={{
          display: 'flex',
          gap: theme.spacing.md,
          marginBottom: theme.spacing.lg,
          flexWrap: 'wrap',
        }}
      >
        <ActionButton
          label={dryRunLabel}
          tone="primary"
          disabled={inFlight !== null}
          inFlight={inFlight === dryRunLabel}
          onClick={() => run(true, dryRunLabel)}
        />
        <ActionButton
          label={startLabel}
          tone="danger"
          disabled={inFlight !== null}
          inFlight={inFlight === startLabel}
          onClick={() => run(false, startLabel)}
        />
      </div>

      {message && (
        <div
          role="status"
          style={{
            padding: theme.spacing.md,
            marginBottom: theme.spacing.lg,
            backgroundColor: message.startsWith('Error:')
              ? theme.colors.error.light
              : theme.colors.success.light,
            color: message.startsWith('Error:')
              ? theme.colors.error.main
              : theme.colors.success.main,
            borderRadius: 4,
          }}
        >
          {message}
        </div>
      )}

      {result && (
        <div style={{ marginTop: theme.spacing.lg }}>
          <h3
            style={{
              fontSize: theme.typography.fontSize.lg,
              fontWeight: theme.typography.fontWeight.semibold,
              marginBottom: theme.spacing.sm,
            }}
          >
            {t('admin.reencryption.categoryRuleIds.resultTitle')}
            {result.dryRun
              ? ` ${t('admin.reencryption.categoryRuleIds.dryRunBadge')}`
              : ''}
          </h3>
          <div
            style={{
              display: 'flex',
              gap: theme.spacing.lg,
              flexWrap: 'wrap',
            }}
          >
            <StatusCard
              label={t('admin.reencryption.categoryRuleIds.columns.totalUsers')}
              value={result.totalUsers}
              tone="neutral"
            />
            <StatusCard
              label={t(
                'admin.reencryption.categoryRuleIds.columns.succeededUsers',
              )}
              value={result.succeededUsers}
              tone="success"
            />
            <StatusCard
              label={t(
                'admin.reencryption.categoryRuleIds.columns.failedUsers',
              )}
              value={result.failedUsers}
              tone={result.failedUsers > 0 ? 'warning' : 'neutral'}
            />
            <StatusCard
              label={t(
                'admin.reencryption.categoryRuleIds.columns.totalScanned',
              )}
              value={result.totalScanned}
              tone="neutral"
            />
            <StatusCard
              label={t(
                'admin.reencryption.categoryRuleIds.columns.totalMatched',
              )}
              value={result.totalMatched}
              tone="success"
            />
            <StatusCard
              label={t(
                'admin.reencryption.categoryRuleIds.columns.totalOrphaned',
              )}
              value={result.totalOrphaned}
              tone={result.totalOrphaned > 0 ? 'warning' : 'neutral'}
            />
          </div>
        </div>
      )}
    </div>
  );
};

interface StatusCardProps {
  label: string;
  value: number | string;
  tone: 'success' | 'warning' | 'neutral' | 'error';
  hint?: string;
}

interface HealthBreakdownSectionProps {
  health: ReencryptionHealth;
}

const numCell = {
  textAlign: 'right' as const,
  padding: theme.spacing.sm,
};
const headRow = {
  borderBottom: `1px solid ${theme.colors.border.light}`,
};

/**
 * Per-column + per-user breakdown of plaintext-at-rest values — the actionable
 * detail behind the "rows needing remediation" headline. Only columns with a
 * non-zero count are listed; a clean scan shows an explicit all-encrypted note.
 */
const HealthBreakdownSection: React.FC<HealthBreakdownSectionProps> = ({
  health,
}) => {
  const { t } = useTranslation();
  const affectedColumns = health.byColumn.filter(
    (col) => col.needsRemediation > 0,
  );

  return (
    <div style={{ marginTop: theme.spacing.lg }}>
      <h3
        style={{
          fontSize: theme.typography.fontSize.lg,
          fontWeight: theme.typography.fontWeight.semibold,
          marginBottom: theme.spacing.xs,
        }}
      >
        {t('admin.reencryption.health.breakdownTitle')}
      </h3>
      <p
        style={{
          fontSize: theme.typography.fontSize.sm,
          color: theme.colors.text.secondary,
          marginBottom: theme.spacing.sm,
        }}
      >
        {t('admin.reencryption.health.breakdownSubtitle')}
      </p>

      {affectedColumns.length === 0 ? (
        <div
          role="status"
          style={{
            padding: theme.spacing.md,
            backgroundColor: theme.colors.success.light,
            color: theme.colors.success.main,
            borderRadius: 4,
          }}
        >
          {t('admin.reencryption.health.allEncrypted')}
        </div>
      ) : (
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          <thead>
            <tr style={headRow}>
              <th style={{ textAlign: 'left', padding: theme.spacing.sm }}>
                {t('admin.reencryption.health.columns.table')}
              </th>
              <th style={{ textAlign: 'left', padding: theme.spacing.sm }}>
                {t('admin.reencryption.health.columns.column')}
              </th>
              <th style={numCell}>
                {t('admin.reencryption.health.columns.needsRemediation')}
              </th>
              <th style={numCell}>
                {t('admin.reencryption.health.columns.pgArray')}
              </th>
              <th style={numCell}>
                {t('admin.reencryption.health.columns.encrypted')}
              </th>
              <th style={numCell}>
                {t('admin.reencryption.health.columns.total')}
              </th>
            </tr>
          </thead>
          <tbody>
            {affectedColumns.map((col) => (
              <tr key={`${col.table}.${col.column}`} style={headRow}>
                <td style={{ padding: theme.spacing.sm }}>{col.table}</td>
                <td style={{ padding: theme.spacing.sm }}>{col.column}</td>
                <td
                  style={{
                    ...numCell,
                    color: theme.colors.error.main,
                    fontWeight: theme.typography.fontWeight.semibold,
                  }}
                >
                  {col.needsRemediation}
                </td>
                <td style={numCell}>{col.pgArrayLiteral}</td>
                <td style={numCell}>{col.encrypted}</td>
                <td style={numCell}>{col.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {health.topAffectedUsers.length > 0 && (
        <div style={{ marginTop: theme.spacing.lg }}>
          <h4
            style={{
              fontSize: theme.typography.fontSize.md,
              fontWeight: theme.typography.fontWeight.semibold,
              marginBottom: theme.spacing.sm,
            }}
          >
            {t('admin.reencryption.health.topUsersTitle')}
          </h4>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: theme.typography.fontSize.sm,
            }}
          >
            <thead>
              <tr style={headRow}>
                <th style={{ textAlign: 'left', padding: theme.spacing.sm }}>
                  {t('admin.reencryption.health.columns.user')}
                </th>
                <th style={numCell}>
                  {t('admin.reencryption.health.columns.rows')}
                </th>
              </tr>
            </thead>
            <tbody>
              {health.topAffectedUsers.map((user) => (
                <tr key={user.userId} style={headRow}>
                  <td
                    style={{
                      padding: theme.spacing.sm,
                      fontFamily: 'monospace',
                    }}
                  >
                    {user.userId}
                  </td>
                  <td style={numCell}>{user.rowsNeedingRemediation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p
        style={{
          fontSize: theme.typography.fontSize.xs,
          color: theme.colors.text.secondary,
          marginTop: theme.spacing.sm,
        }}
      >
        {t('admin.reencryption.health.scannedNote', {
          tables: health.scannedTables,
        })}
      </p>
    </div>
  );
};

const StatusCard: React.FC<StatusCardProps> = ({
  label,
  value,
  tone,
  hint,
}) => {
  const colors = {
    success: theme.colors.success.main,
    warning: theme.colors.warning.main,
    neutral: theme.colors.text.primary,
    error: theme.colors.error.main,
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
      {hint && (
        <div
          style={{
            fontSize: theme.typography.fontSize.xs,
            color: theme.colors.text.secondary,
            marginTop: theme.spacing.xs,
          }}
        >
          {hint}
        </div>
      )}
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
    cleared: string;
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
            {headers.cleared}
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
                  (row.rowsCleared ?? 0) > 0
                    ? theme.colors.warning.main
                    : theme.colors.text.primary,
              }}
            >
              {row.rowsCleared ?? 0}
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

function collectSelfDryRunFailures(
  result: DryRunResult,
): Array<FailureDetail & { userId?: string }> {
  const out: Array<FailureDetail & { userId?: string }> = [];
  for (const tableResult of result.tables) {
    for (const failure of tableResult.failures ?? []) {
      out.push({ ...failure, userId: result.userId });
    }
  }
  return out;
}

const MAX_DISPLAYED_FAILURES = 100;

interface FailureDetailsSectionProps {
  failures: Array<FailureDetail & { userId?: string | null }>;
  showUserColumn: boolean;
}

const FailureDetailsSection: React.FC<FailureDetailsSectionProps> = ({
  failures,
  showUserColumn,
}) => {
  const { t } = useTranslation();
  if (failures.length === 0) {
    return (
      <div
        style={{
          marginTop: theme.spacing.lg,
          padding: theme.spacing.md,
          backgroundColor: theme.colors.success.light,
          color: theme.colors.success.main,
          borderRadius: 4,
        }}
      >
        {t('admin.reencryption.fanout.noFailures')}
      </div>
    );
  }
  const shown = failures.slice(0, MAX_DISPLAYED_FAILURES);
  return (
    <div style={{ marginTop: theme.spacing.lg }}>
      <h3
        style={{
          fontSize: theme.typography.fontSize.lg,
          fontWeight: theme.typography.fontWeight.semibold,
          marginBottom: theme.spacing.sm,
        }}
      >
        {t('admin.reencryption.fanout.failuresTitle', {
          shown: shown.length,
          total: failures.length,
        })}
      </h3>
      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: theme.typography.fontSize.xs,
            fontFamily: 'monospace',
          }}
        >
          <thead>
            <tr
              style={{ borderBottom: `1px solid ${theme.colors.border.light}` }}
            >
              {showUserColumn && (
                <th style={{ textAlign: 'left', padding: theme.spacing.sm }}>
                  {t('admin.reencryption.fanout.failureColumns.user')}
                </th>
              )}
              <th style={{ textAlign: 'left', padding: theme.spacing.sm }}>
                {t('admin.reencryption.fanout.failureColumns.table')}
              </th>
              <th style={{ textAlign: 'left', padding: theme.spacing.sm }}>
                {t('admin.reencryption.fanout.failureColumns.rowId')}
              </th>
              <th style={{ textAlign: 'left', padding: theme.spacing.sm }}>
                {t('admin.reencryption.fanout.failureColumns.column')}
              </th>
              <th style={{ textAlign: 'left', padding: theme.spacing.sm }}>
                {t('admin.reencryption.fanout.failureColumns.reason')}
              </th>
              <th style={{ textAlign: 'left', padding: theme.spacing.sm }}>
                {t('admin.reencryption.fanout.failureColumns.shape')}
              </th>
              <th style={{ textAlign: 'left', padding: theme.spacing.sm }}>
                {t('admin.reencryption.fanout.failureColumns.preview')}
              </th>
              <th style={{ textAlign: 'left', padding: theme.spacing.sm }}>
                {t('admin.reencryption.fanout.failureColumns.error')}
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((failure, i) => (
              <tr
                key={`${failure.table}-${failure.rowId}-${failure.column}-${i}`}
                style={{
                  borderBottom: `1px solid ${theme.colors.border.light}`,
                }}
              >
                {showUserColumn && (
                  <td style={{ padding: theme.spacing.sm }}>
                    {failure.userId ?? '—'}
                  </td>
                )}
                <td style={{ padding: theme.spacing.sm }}>{failure.table}</td>
                <td style={{ padding: theme.spacing.sm }}>{failure.rowId}</td>
                <td style={{ padding: theme.spacing.sm }}>{failure.column}</td>
                <td
                  style={{
                    padding: theme.spacing.sm,
                    color: theme.colors.error.main,
                  }}
                >
                  {failure.reason}
                </td>
                <td style={{ padding: theme.spacing.sm }}>
                  {failure.ivHexLen}/{failure.tagHexLen}/{failure.bodyHexLen}
                </td>
                <td style={{ padding: theme.spacing.sm }}>
                  {failure.prefix}…{failure.suffix}
                </td>
                <td style={{ padding: theme.spacing.sm }}>
                  {failure.errorMessage}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

interface FanoutAggregateSectionProps {
  results: FanoutResultsResponse;
  onRefresh: () => void;
}

const FanoutAggregateSection: React.FC<FanoutAggregateSectionProps> = ({
  results,
  onRefresh,
}) => {
  const { t } = useTranslation();
  const inProgress = results.childrenTerminal < results.childrenTotal;
  return (
    <div style={{ marginTop: theme.spacing.xl }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: theme.spacing.sm,
        }}
      >
        <h3
          style={{
            fontSize: theme.typography.fontSize.lg,
            fontWeight: theme.typography.fontWeight.semibold,
            margin: 0,
          }}
        >
          {t('admin.reencryption.fanout.aggregateTitle')}
        </h3>
        <button
          type="button"
          onClick={onRefresh}
          style={{
            padding: `${theme.spacing.xs} ${theme.spacing.md}`,
            backgroundColor: theme.colors.background.paper,
            border: `1px solid ${theme.colors.border.light}`,
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          {t('admin.reencryption.fanout.refresh')}
        </button>
      </div>

      <div
        role="status"
        style={{
          padding: theme.spacing.sm,
          marginBottom: theme.spacing.md,
          backgroundColor: inProgress
            ? theme.colors.warning.light
            : theme.colors.success.light,
          color: inProgress
            ? theme.colors.warning.main
            : theme.colors.success.main,
          borderRadius: 4,
          fontSize: theme.typography.fontSize.sm,
        }}
      >
        {inProgress
          ? t('admin.reencryption.fanout.polling', {
              terminal: results.childrenTerminal,
              total: results.childrenTotal,
            })
          : t('admin.reencryption.fanout.complete', {
              total: results.childrenTotal,
            })}
        {' · '}
        {t('admin.reencryption.fanout.childrenCompleted')}:{' '}
        {results.childrenCompleted}
        {' · '}
        {t('admin.reencryption.fanout.childrenFailed')}: {results.childrenFailed}
        {' · '}
        {t('admin.reencryption.fanout.usersWithRowFailures')}:{' '}
        {results.usersWithRowFailures}
      </div>

      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: theme.typography.fontSize.sm,
        }}
      >
        <thead>
          <tr
            style={{ borderBottom: `1px solid ${theme.colors.border.light}` }}
          >
            <th style={{ textAlign: 'left', padding: theme.spacing.sm }}>
              {t('admin.reencryption.columns.table')}
            </th>
            <th style={{ textAlign: 'right', padding: theme.spacing.sm }}>
              {t('admin.reencryption.columns.scanned')}
            </th>
            <th style={{ textAlign: 'right', padding: theme.spacing.sm }}>
              {t('admin.reencryption.columns.rewritten')}
            </th>
            <th style={{ textAlign: 'right', padding: theme.spacing.sm }}>
              {t('admin.reencryption.columns.alreadyMigrated')}
            </th>
            <th style={{ textAlign: 'right', padding: theme.spacing.sm }}>
              {t('admin.reencryption.columns.cleared')}
            </th>
            <th style={{ textAlign: 'right', padding: theme.spacing.sm }}>
              {t('admin.reencryption.columns.failed')}
            </th>
          </tr>
        </thead>
        <tbody>
          {results.tables.map((row) => (
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
                    (row.rowsCleared ?? 0) > 0
                      ? theme.colors.warning.main
                      : theme.colors.text.primary,
                }}
              >
                {row.rowsCleared ?? 0}
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

      <FailureDetailsSection failures={results.failures} showUserColumn />
      <ChildJobErrorsSection
        errors={results.childJobErrors ?? []}
        childrenFailed={results.childrenFailed}
        nonCompletedTerminal={
          results.childrenTerminal - results.childrenCompleted
        }
        children={results.children}
      />
    </div>
  );
};

interface ChildJobErrorsSectionProps {
  errors: ChildJobError[];
  childrenFailed: number;
  nonCompletedTerminal: number;
  children: ChildJobSummary[];
}

const ChildJobErrorsSection: React.FC<ChildJobErrorsSectionProps> = ({
  errors,
  childrenFailed,
  nonCompletedTerminal,
  children,
}) => {
  const { t } = useTranslation();

  // Belt-and-braces against a server that returned `childJobErrors: []` (or
  // omitted the field entirely on an old build) even though children failed.
  // The aggregated `children` array always carries per-child state, so we
  // synthesise display rows from it. This guarantees the admin sees something
  // actionable for issue #2132 even if the server hasn't picked up the latest
  // aggregation logic yet.
  const synthesisedFromChildren: ChildJobError[] =
    errors.length === 0 && nonCompletedTerminal > 0
      ? children
          .filter((child) => child.state !== JOB_STATE_COMPLETED)
          .map((child) => ({
            jobId: child.jobId,
            userId: child.userId,
            state: child.state,
            message: t(
              'admin.reencryption.fanout.childJobErrorFallbackMessage',
              { state: child.state },
            ),
            outputPreview: null,
          }))
      : [];

  const rows = errors.length > 0 ? errors : synthesisedFromChildren;
  const showSection = rows.length > 0 || childrenFailed > 0;
  if (!showSection) {
    return null;
  }
  return (
    <div style={{ marginTop: theme.spacing.lg }}>
      <h3
        style={{
          fontSize: theme.typography.fontSize.lg,
          fontWeight: theme.typography.fontWeight.semibold,
          marginBottom: theme.spacing.xs,
        }}
      >
        {t('admin.reencryption.fanout.childJobErrorsTitle', {
          count: nonCompletedTerminal || childrenFailed,
        })}
      </h3>
      <p
        style={{
          fontSize: theme.typography.fontSize.sm,
          color: theme.colors.text.secondary,
          marginBottom: theme.spacing.sm,
        }}
      >
        {t('admin.reencryption.fanout.childJobErrorsDescription')}
      </p>
      {rows.length === 0 && (
        <div
          role="status"
          style={{
            padding: theme.spacing.md,
            marginBottom: theme.spacing.sm,
            backgroundColor: theme.colors.warning.light,
            color: theme.colors.warning.main,
            borderRadius: 4,
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          {t('admin.reencryption.fanout.childJobErrorsNoDetailWarning', {
            count: childrenFailed,
          })}
        </div>
      )}
      {rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: theme.typography.fontSize.xs,
              fontFamily: 'monospace',
            }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: `1px solid ${theme.colors.border.light}`,
                }}
              >
                <th style={{ textAlign: 'left', padding: theme.spacing.sm }}>
                  {t('admin.reencryption.fanout.childJobErrorColumns.jobId')}
                </th>
                <th style={{ textAlign: 'left', padding: theme.spacing.sm }}>
                  {t('admin.reencryption.fanout.childJobErrorColumns.user')}
                </th>
                <th style={{ textAlign: 'left', padding: theme.spacing.sm }}>
                  {t('admin.reencryption.fanout.childJobErrorColumns.state')}
                </th>
                <th style={{ textAlign: 'left', padding: theme.spacing.sm }}>
                  {t('admin.reencryption.fanout.childJobErrorColumns.error')}
                </th>
                <th style={{ textAlign: 'left', padding: theme.spacing.sm }}>
                  {t('admin.reencryption.fanout.childJobErrorColumns.rawOutput')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((err, i) => (
                <tr
                  key={`${err.jobId}-${i}`}
                  style={{
                    borderBottom: `1px solid ${theme.colors.border.light}`,
                  }}
                >
                  <td style={{ padding: theme.spacing.sm }}>{err.jobId}</td>
                  <td style={{ padding: theme.spacing.sm }}>
                    {err.userId ?? '—'}
                  </td>
                  <td style={{ padding: theme.spacing.sm }}>
                    {err.state ?? '—'}
                  </td>
                  <td
                    style={{
                      padding: theme.spacing.sm,
                      color: theme.colors.error.main,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {err.message}
                  </td>
                  <td
                    style={{
                      padding: theme.spacing.sm,
                      color: theme.colors.text.secondary,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                      maxWidth: 320,
                    }}
                  >
                    {err.outputPreview ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
