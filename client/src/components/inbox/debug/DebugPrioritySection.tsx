/**
 * DebugPrioritySection — priority debug panel for the inbox debug view.
 *
 * Implements #1571 Item 3. Displays:
 * - Per-mode bucket counts (triage / action / follow-up)
 * - Current filter state (minPriority, maxPriority from props + localStorage raw value)
 * - Computed priorityTotalCount as shown in the header
 * - Cache state (exists, age, CACHE_VERSION key prefix)
 * - Priority score histogram (10-point bands)
 * - Refresh button to re-fetch
 */
import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { theme } from 'theme/theme';
import { CACHE_VERSION } from 'utils/emailCache';

import { API_URL } from 'config/api';
import type { InboxFilter } from 'hooks/useInboxFilters';

interface PriorityBuckets {
  veryHigh: number;
  high: number;
  medium: number;
  low: number;
  veryLow: number;
  unprioritised: number;
}

interface PriorityDebugInfo {
  bucketsByMode: {
    triage: PriorityBuckets;
    action: PriorityBuckets;
    followUp: PriorityBuckets;
  };
  histogram: Array<{ band: string; count: number }>;
  nullPriorityCount: number;
  fetchedAt: string;
}

interface DebugPrioritySectionProps {
  /** Active inbox filter state — used to show current minPriority / maxPriority. */
  filters?: InboxFilter;
  /** The computed total shown in the priority filter header (from Inbox.tsx bucket overlap logic). */
  priorityTotalCount?: number;
}

const LABEL_STYLE = {
  fontWeight: theme.typography.fontWeight.semibold,
  color: theme.colors.text.primary,
  marginRight: '4px',
} as const;

const VALUE_STYLE = {
  color: theme.colors.text.secondary,
  fontFamily: 'monospace',
} as const;

const TABLE_CELL: React.CSSProperties = {
  padding: '2px 8px',
  textAlign: 'right' as const,
  borderBottom: `1px solid ${theme.colors.border.light}`,
};
const TABLE_HEADER_CELL: React.CSSProperties = {
  ...TABLE_CELL,
  fontWeight: theme.typography.fontWeight.semibold,
  color: theme.colors.text.secondary,
  textAlign: 'right' as const,
};

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60_000;
const LOADING_OPACITY = 0.5;
/** Debug panel accent colours — purple tones not in the main design system. */
const DEBUG_PANEL_BG = '#F3E5F5';
const DEBUG_PANEL_BORDER = '#CE93D8';

function getCacheAgeMs(cacheKey: string): number | null {
  try {
    const raw = localStorage.getItem(cacheKey);
    if (!raw) {
      return null;
    }
    const entry = JSON.parse(raw) as { timestamp?: number };
    if (!entry.timestamp) {
      return null;
    }
    return Date.now() - entry.timestamp;
  } catch {
    return null;
  }
}

function formatMs(ms: number): string {
  if (ms < MS_PER_SECOND) {
    return `${ms}ms`;
  }
  if (ms < MS_PER_MINUTE) {
    return `${(ms / MS_PER_SECOND).toFixed(1)}s`;
  }
  return `${(ms / MS_PER_MINUTE).toFixed(1)}min`;
}

function getCacheDebugInfo(): Array<{ key: string; ageMs: number | null }> {
  const CACHE_PREFIX = `bearlymail_${CACHE_VERSION}_summary_`;
  const results: Array<{ key: string; ageMs: number | null }> = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(CACHE_PREFIX)) {
        results.push({ key, ageMs: getCacheAgeMs(key) });
      }
    }
  } catch {
    // ignore
  }
  return results;
}

export const DebugPrioritySection: React.FC<DebugPrioritySectionProps> = ({
  filters,
  priorityTotalCount,
}) => {
  const [data, setData] = useState<PriorityDebugInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await axios.get<PriorityDebugInfo>(`${API_URL}/emails/debug/priority-info`);
      setData(resp.data);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const cacheEntries = getCacheDebugInfo();

  const rawLocalStorage = (() => {
    try {
      return localStorage.getItem('inbox_filters');
    } catch {
      return null;
    }
  })();

  return (
    <div
      style={{
        marginBottom: theme.spacing.md,
        padding: theme.spacing.sm,
        backgroundColor: DEBUG_PANEL_BG,
        borderRadius: theme.borderRadius.sm,
        border: `1px solid ${DEBUG_PANEL_BORDER}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: theme.spacing.sm,
        }}
      >
        <h4 style={{ margin: 0 }}>🔢 Priority Debug</h4>
        <button
          onClick={fetchData}
          disabled={loading}
          style={{
            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
            backgroundColor: theme.colors.primary.main,
            color: theme.colors.common.white,
            border: 'none',
            borderRadius: theme.borderRadius.sm,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? LOADING_OPACITY : 1,
            fontSize: theme.typography.fontSize.xs,
          }}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {/* Current filter state */}
      <div style={{ marginBottom: theme.spacing.sm }}>
        <strong>Current filter:</strong>{' '}
        <span style={VALUE_STYLE}>
          minPriority={String(filters?.minPriority ?? 'null')}, maxPriority={String(filters?.maxPriority ?? 'null')}
        </span>
        {' | '}
        <span style={LABEL_STYLE}>priorityTotalCount:</span>
        <span style={VALUE_STYLE}>{String(priorityTotalCount ?? 'n/a')}</span>
      </div>

      <div style={{ marginBottom: theme.spacing.sm, fontSize: theme.typography.fontSize.xs, wordBreak: 'break-all' }}>
        <strong>localStorage raw:</strong>{' '}
        <span style={VALUE_STYLE}>{rawLocalStorage ?? '(not set)'}</span>
      </div>

      {/* Cache state */}
      <div style={{ marginBottom: theme.spacing.sm }}>
        <strong>Cache entries (bearlymail_{CACHE_VERSION}_summary_*):</strong>{' '}
        {cacheEntries.length === 0 ? (
          <span style={VALUE_STYLE}>(none)</span>
        ) : (
          cacheEntries.map(entry => (
            <span key={entry.key} style={{ ...VALUE_STYLE, display: 'inline-block', marginRight: '8px' }}>
              {entry.key.replace(`bearlymail_${CACHE_VERSION}_summary_`, '')}:{' '}
              {entry.ageMs !== null ? formatMs(entry.ageMs) + ' old' : 'no timestamp'}
            </span>
          ))
        )}
      </div>

      {error && (
        <div style={{ color: theme.colors.error?.main ?? 'red', marginBottom: theme.spacing.sm }}>
          Error: {error}
        </div>
      )}

      {data && (
        <>
          {/* Per-mode bucket counts */}
          <div style={{ marginBottom: theme.spacing.sm }}>
            <strong>Bucket counts by mode:</strong>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '4px', fontSize: '11px' }}>
              <thead>
                <tr>
                  <th style={{ ...TABLE_HEADER_CELL, textAlign: 'left' as const }}>Mode</th>
                  <th style={TABLE_HEADER_CELL}>VH</th>
                  <th style={TABLE_HEADER_CELL}>H</th>
                  <th style={TABLE_HEADER_CELL}>M</th>
                  <th style={TABLE_HEADER_CELL}>L</th>
                  <th style={TABLE_HEADER_CELL}>VL</th>
                  <th style={TABLE_HEADER_CELL}>Unpri</th>
                  <th style={TABLE_HEADER_CELL}>Total</th>
                </tr>
              </thead>
              <tbody>
                {(['triage', 'action', 'followUp'] as const).map(modeKey => {
                  const buckets = data.bucketsByMode[modeKey];
                  const total = buckets.veryHigh + buckets.high + buckets.medium + buckets.low + buckets.veryLow + buckets.unprioritised;
                  return (
                    <tr key={modeKey}>
                      <td style={{ ...TABLE_CELL, textAlign: 'left' as const }}>{modeKey}</td>
                      <td style={TABLE_CELL}>{buckets.veryHigh}</td>
                      <td style={TABLE_CELL}>{buckets.high}</td>
                      <td style={TABLE_CELL}>{buckets.medium}</td>
                      <td style={TABLE_CELL}>{buckets.low}</td>
                      <td style={TABLE_CELL}>{buckets.veryLow}</td>
                      <td style={TABLE_CELL}>{buckets.unprioritised}</td>
                      <td style={{ ...TABLE_CELL, fontWeight: theme.typography.fontWeight.semibold }}>{total}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Priority score histogram */}
          <div style={{ marginBottom: theme.spacing.sm }}>
            <strong>Score histogram (10-point bands):</strong>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
              {data.histogram.length === 0 ? (
                <span style={VALUE_STYLE}>(no scored threads)</span>
              ) : (
                data.histogram.map(row => (
                  <span
                    key={row.band}
                    style={{
                      ...VALUE_STYLE,
                      backgroundColor: theme.colors.background.subtle,
                      padding: '2px 6px',
                      borderRadius: theme.borderRadius.sm,
                      border: `1px solid ${theme.colors.border.light}`,
                      fontSize: '11px',
                    }}
                  >
                    {row.band}: {row.count}
                  </span>
                ))
              )}
            </div>
            <div style={{ marginTop: '4px', fontSize: '11px', color: theme.colors.text.tertiary }}>
              NULL priority: {data.nullPriorityCount} threads
            </div>
          </div>

          <div style={{ fontSize: '10px', color: theme.colors.text.tertiary }}>
            Fetched at: {new Date(data.fetchedAt).toLocaleTimeString()}
          </div>
        </>
      )}
    </div>
  );
};
