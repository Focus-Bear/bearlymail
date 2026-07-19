import React, { useCallback, useState } from 'react';
import axios, { AxiosError } from 'axios';
import { theme } from 'theme/theme';

import { API_URL } from 'config/api';
import {
  COLOR_BG_ERROR,
  COLOR_BG_LIGHT_GRAY,
  COLOR_BG_NEUTRAL_ALT,
  COLOR_ERROR_DARK,
  COLOR_GREY_LIGHT,
  COLOR_WHITE,
} from 'constants/colors';
import { CATEGORY_KEY_UNCATEGORIZED } from 'store/slices/inboxDataSlice';

/**
 * Mirrors {@link server/src/emails/email-inbox-trace.service.ts#CategoryFetchTrace}.
 * Issue #1954 — diagnostics for "summary shows N but loaded 0" accordion bugs.
 */
interface CategoryFetchTraceDrop {
  threadId: string;
  stage:
    | 'blocked_sender'
    | 'category_filter'
    | 'action_mode_user_sent_last'
    | 'follow_up_mode_no_reply_pending'
    | 'limit';
  reason: string;
}

interface CategoryFetchTraceThreadDetail {
  threadId: string;
  categoryId: string | null;
  categoryName: string | null;
  clientGroupKey: string;
  summaryBucketKey: string;
  keyMismatch: boolean;
  account: {
    provider: 'google' | 'office365' | 'zoho' | 'unknown';
    accountId: string | null;
  };
  inRawQuery: boolean;
}

interface CategoryFetchTrace {
  categoryId: string | null;
  categoryName: string;
  mode: 'triage' | 'action' | 'follow-up';
  resolvedCategoryUuids: string[];
  treatedAsOther: boolean;
  summaryThreadIds: string[];
  rawQueryAllThreadIds: string[];
  rawQueryCategoryThreadIds: string[];
  afterBlockedFilterThreadIds: string[];
  afterCategoryFilterThreadIds: string[];
  afterModeFilterThreadIds: string[];
  drops: CategoryFetchTraceDrop[];
  summaryOnlyThreadIds: string[];
  rawOnlyThreadIds: string[];
  summaryToRawDriftMs: number;
  summaryThreadDetails: CategoryFetchTraceThreadDetail[];
}

interface Props {
  categoryKey: string;
  categoryName: string;
  mode: 'triage' | 'action' | 'follow-up';
}

const STAGE_LABELS: Record<CategoryFetchTraceDrop['stage'], string> = {
  blocked_sender: 'Blocked sender',
  category_filter: 'Category filter',
  action_mode_user_sent_last: 'Action mode (user sent last)',
  follow_up_mode_no_reply_pending: 'Follow-up mode (no reply pending)',
  limit: 'Result limit',
};

const monoStyle: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: theme.typography.fontSize.xs,
};

const codeStyle: React.CSSProperties = {
  ...monoStyle,
  backgroundColor: COLOR_BG_LIGHT_GRAY,
  padding: '2px 6px',
  borderRadius: '4px',
};

const ThreadIdList: React.FC<{ ids: string[]; emptyHint?: string }> = ({ ids, emptyHint }) => {
  if (ids.length === 0) {
    return <span style={{ color: theme.colors.text.secondary, marginLeft: theme.spacing.xs }}>{emptyHint ?? '(none)'}</span>;
  }
  return (
    <div
      style={{
        maxHeight: '120px',
        overflowY: 'auto',
        marginTop: theme.spacing.xs,
        backgroundColor: COLOR_WHITE,
        padding: theme.spacing.xs,
        borderRadius: theme.borderRadius.sm,
        border: '1px solid #E0E0E0',
      }}
    >
      {ids.map(threadId => (
        <div key={threadId} style={{ ...monoStyle, padding: '2px 4px' }}>
          {threadId}
        </div>
      ))}
    </div>
  );
};

const StageRow: React.FC<{ label: string; ids: string[] }> = ({ label, ids }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '160px 60px 1fr', alignItems: 'center', gap: theme.spacing.sm }}>
    <strong style={{ fontSize: theme.typography.fontSize.xs }}>{label}</strong>
    <code style={codeStyle}>{ids.length}</code>
    <ThreadIdList ids={ids} />
  </div>
);

const DropList: React.FC<{ drops: CategoryFetchTraceDrop[] }> = ({ drops }) => {
  if (drops.length === 0) {
    return null;
  }
  const byStage = drops.reduce<Record<string, CategoryFetchTraceDrop[]>>((acc, drop) => {
    (acc[drop.stage] ??= []).push(drop);
    return acc;
  }, {});
  return (
    <div
      style={{
        marginTop: theme.spacing.sm,
        padding: theme.spacing.sm,
        backgroundColor: COLOR_BG_ERROR,
        borderRadius: theme.borderRadius.sm,
        border: '1px solid #FFCDD2',
        color: COLOR_ERROR_DARK,
      }}
    >
      <strong>Dropped threads ({drops.length}):</strong>
      {Object.entries(byStage).map(([stage, stageDrops]) => (
        <div key={stage} style={{ marginTop: theme.spacing.xs }}>
          <div style={{ fontWeight: 'bold' }}>
            {STAGE_LABELS[stage as CategoryFetchTraceDrop['stage']]} — {stageDrops.length}
          </div>
          {stageDrops.map(drop => (
            <div key={`${drop.stage}-${drop.threadId}`} style={{ marginLeft: theme.spacing.sm, marginTop: 2 }}>
              <code style={{ ...monoStyle, color: COLOR_ERROR_DARK }}>{drop.threadId}</code>
              <span style={{ marginLeft: theme.spacing.xs, color: COLOR_GREY_LIGHT }}>—</span>{' '}
              <span style={{ fontSize: theme.typography.fontSize.xs }}>{drop.reason}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

/**
 * Issue #2062 — the deciding evidence. For each thread the summary counted, shows
 * its resolved categoryId/name, the account it's on, and whether the client group
 * key diverges from the summary's bucket key. A mismatch where categoryName ===
 * "Other" proves the naming-collision theory; threads missing from the raw query
 * (inRawQuery=false) would instead implicate a server-side filter (e.g. account).
 */
const SummaryThreadDetails: React.FC<{ details?: CategoryFetchTraceThreadDetail[] }> = ({ details = [] }) => {
  if (details.length === 0) {
    return null;
  }
  const offenders = details.filter(detail => detail.keyMismatch);
  const namedOther = offenders.filter(detail => detail.categoryName === 'Other');
  const missingFromRaw = details.filter(detail => !detail.inRawQuery);

  let verdict: string;
  if (namedOther.length > 0) {
    verdict = `🎯 ${namedOther.length} counted thread(s) carry a non-null categoryId but resolve to category name "Other" → naming collision (client keys by UUID, accordion keys "uncategorized").`;
  } else if (offenders.length > 0) {
    verdict = `⚠️ ${offenders.length} counted thread(s) have a key mismatch but their name is not "Other" — different cause (e.g. stale UUID).`;
  } else if (missingFromRaw.length > 0) {
    verdict = `⚠️ ${missingFromRaw.length} counted thread(s) are absent from the raw inbox query → a server-side filter (account/blocked/mode) dropped them, NOT a grouping-key issue.`;
  } else {
    verdict = '✅ No key mismatch and all counted threads present in the raw query.';
  }

  return (
    <div>
      <strong style={{ fontSize: theme.typography.fontSize.xs }}>Per-thread category &amp; account ({details.length}):</strong>
      <div style={{ ...monoStyle, marginTop: theme.spacing.xs, color: theme.colors.text.primary }}>{verdict}</div>
      <div
        style={{
          maxHeight: '200px',
          overflowY: 'auto',
          marginTop: theme.spacing.xs,
          backgroundColor: COLOR_WHITE,
          padding: theme.spacing.xs,
          borderRadius: theme.borderRadius.sm,
          border: '1px solid #E0E0E0',
        }}
      >
        {details.map(detail => (
          <div
            key={detail.threadId}
            style={{
              ...monoStyle,
              padding: '3px 4px',
              borderBottom: '1px solid #F0F0F0',
              backgroundColor: detail.keyMismatch ? COLOR_BG_ERROR : 'transparent',
            }}
          >
            <div>{detail.threadId}</div>
            <div style={{ color: theme.colors.text.secondary }}>
              categoryId=<code style={codeStyle}>{detail.categoryId ?? 'null'}</code>{' '}
              name=<code style={codeStyle}>{detail.categoryName ?? '(none)'}</code>
            </div>
            <div style={{ color: theme.colors.text.secondary }}>
              clientKey=<code style={codeStyle}>{detail.clientGroupKey}</code>{' '}
              summaryKey=<code style={codeStyle}>{detail.summaryBucketKey}</code>{' '}
              {detail.keyMismatch ? <span style={{ color: COLOR_ERROR_DARK }}>✗ mismatch</span> : <span>✓ match</span>}
            </div>
            <div style={{ color: theme.colors.text.secondary }}>
              account=<code style={codeStyle}>{detail.account.provider}:{detail.account.accountId ?? 'null'}</code>{' '}
              inRawQuery=<code style={codeStyle}>{String(detail.inRawQuery)}</code>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const TraceContent: React.FC<{ trace: CategoryFetchTrace }> = ({ trace }) => (
  <div
    style={{
      marginTop: theme.spacing.sm,
      padding: theme.spacing.sm,
      backgroundColor: COLOR_BG_NEUTRAL_ALT,
      borderRadius: theme.borderRadius.sm,
      border: '1px solid #E0E0E0',
      display: 'flex',
      flexDirection: 'column',
      gap: theme.spacing.sm,
    }}
  >
    <div style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.text.secondary }}>
      <code style={codeStyle}>summary→raw drift</code> {trace.summaryToRawDriftMs}ms{' · '}
      <code style={codeStyle}>treatedAsOther</code> {String(trace.treatedAsOther)}{' · '}
      <code style={codeStyle}>resolvedUuids</code> {trace.resolvedCategoryUuids.join(', ') || '(none)'}
    </div>
    <StageRow label="Summary thread IDs" ids={trace.summaryThreadIds} />
    <StageRow label="Raw query (all threads)" ids={trace.rawQueryAllThreadIds} />
    <StageRow label="After category filter" ids={trace.afterCategoryFilterThreadIds} />
    <StageRow label="After blocked filter" ids={trace.afterBlockedFilterThreadIds} />
    <StageRow label="After mode filter (final)" ids={trace.afterModeFilterThreadIds} />
    <SummaryThreadDetails details={trace.summaryThreadDetails} />
    {trace.summaryOnlyThreadIds.length > 0 && (
      <div>
        <strong style={{ fontSize: theme.typography.fontSize.xs }}>Summary-only (not in raw query):</strong>
        <ThreadIdList ids={trace.summaryOnlyThreadIds} />
      </div>
    )}
    {trace.rawOnlyThreadIds.length > 0 && (
      <div>
        <strong style={{ fontSize: theme.typography.fontSize.xs }}>Raw-only (not in summary):</strong>
        <ThreadIdList ids={trace.rawOnlyThreadIds} />
      </div>
    )}
    <DropList drops={trace.drops} />
  </div>
);

function buttonLabel(loading: boolean, hasTrace: boolean): string {
  if (loading) {
    return 'Tracing…';
  }
  if (hasTrace) {
    return '🔄 Re-run trace';
  }
  return '🔬 Trace fetch pipeline';
}

export const CategoryFetchTracePanel: React.FC<Props> = ({ categoryKey, categoryName, mode }) => {
  const [loading, setLoading] = useState(false);
  const [trace, setTrace] = useState<CategoryFetchTrace | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleClick = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        categoryId: categoryKey === CATEGORY_KEY_UNCATEGORIZED ? CATEGORY_KEY_UNCATEGORIZED : categoryKey,
        mode,
      });
      const response = await axios.get<CategoryFetchTrace>(
        `${API_URL}/emails/debug/category-fetch-trace?${params.toString()}`,
      );
      setTrace(response.data);
    } catch (err) {
      const axiosErr = err as AxiosError<{ message?: string }>;
      setError(axiosErr.response?.data?.message ?? axiosErr.message ?? 'Trace failed');
    } finally {
      setLoading(false);
    }
  }, [categoryKey, mode]);

  return (
    <div style={{ marginTop: theme.spacing.sm }}>
      <button
        onClick={handleClick}
        disabled={loading}
        style={{
          padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
          backgroundColor: loading ? '#9E9E9E' : theme.colors.primary.main,
          color: COLOR_WHITE,
          border: 'none',
          borderRadius: theme.borderRadius.sm,
          cursor: loading ? 'wait' : 'pointer',
          fontSize: theme.typography.fontSize.xs,
        }}
        aria-label={`Trace fetch pipeline for ${categoryName} in ${mode} mode`}
      >
        {buttonLabel(loading, trace !== null)}
      </button>
      {error && (
        <div
          style={{
            marginTop: theme.spacing.xs,
            padding: theme.spacing.xs,
            backgroundColor: COLOR_BG_ERROR,
            color: COLOR_ERROR_DARK,
            borderRadius: theme.borderRadius.sm,
            fontSize: theme.typography.fontSize.xs,
          }}
        >
          Trace failed: {error}
        </div>
      )}
      {trace && <TraceContent trace={trace} />}
    </div>
  );
};
