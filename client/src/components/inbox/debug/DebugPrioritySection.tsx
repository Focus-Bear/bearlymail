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
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { theme } from 'theme/theme';
import { CACHE_VERSION } from 'utils/emailCache';
import { getMfaErrorType, MFA_SETUP_REQUIRED, MFA_VERIFICATION_REQUIRED } from 'utils/mfaErrors';

import { API_URL } from 'config/api';
import type { InboxFilter } from 'hooks/useInboxFilters';

const MFA_TOKEN_LENGTH = 6;
const ENTER_KEY = 'Enter';
const COLOR_WHITE = '#fff';
const FOCUS_DELAY_MS = 50;
const MFA_STATES = {
  NONE: 'none',
  VERIFICATION_REQUIRED: 'verification-required',
  SETUP_REQUIRED: 'setup-required',
} as const;
type MfaState = typeof MFA_STATES[keyof typeof MFA_STATES];

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

export const DebugPrioritySection: React.FC<DebugPrioritySectionProps> = ({ filters, priorityTotalCount }) => {
  const { t } = useTranslation();
  const [data, setData] = useState<PriorityDebugInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mfaState, setMfaState] = useState<MfaState>(MFA_STATES.NONE);
  const [mfaToken, setMfaToken] = useState('');
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [mfaLoading, setMfaLoading] = useState(false);
  const mfaInputRef = useRef<HTMLInputElement>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await axios.get<PriorityDebugInfo>(`${API_URL}/emails/debug/priority-info`);
      setData(resp.data);
      setMfaState(MFA_STATES.NONE);
    } catch (err) {
      const mfaType = getMfaErrorType(err);
      if (mfaType === MFA_SETUP_REQUIRED) {
 setMfaState(MFA_STATES.SETUP_REQUIRED); return; 
}
      if (mfaType === MFA_VERIFICATION_REQUIRED) {
        setMfaState(MFA_STATES.VERIFICATION_REQUIRED);
        setTimeout(() => mfaInputRef.current?.focus(), FOCUS_DELAY_MS);
        return;
      }
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleMfaVerify = useCallback(async () => {
    if (mfaToken.length !== MFA_TOKEN_LENGTH) {
return;
}
    setMfaLoading(true);
    setMfaError(null);
    try {
      await axios.post(`${API_URL}/auth/mfa/verify`, { token: mfaToken });
      setMfaToken('');
      setMfaState(MFA_STATES.NONE);
      await fetchData();
    } catch {
      setMfaError(t('admin.mfa.error'));
    } finally {
      setMfaLoading(false);
    }
  }, [mfaToken, fetchData, t]);

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

      {mfaState === MFA_STATES.SETUP_REQUIRED && (
        <div style={{ color: theme.colors.text.secondary, padding: theme.spacing.sm }}>
          {t('admin.mfa.setupRequired')}
        </div>
      )}

      {mfaState === MFA_STATES.VERIFICATION_REQUIRED && (
        <div style={{ padding: theme.spacing.sm }}>
          <p style={{ color: theme.colors.text.primary, marginBottom: theme.spacing.xs, fontWeight: theme.typography.fontWeight.medium }}>
            {t('admin.mfa.required')}
          </p>
          <p style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.xs, marginBottom: theme.spacing.sm }}>
            {t('admin.mfa.prompt')}
          </p>
          <input
            ref={mfaInputRef}
            type="text"
            inputMode="numeric"
            maxLength={MFA_TOKEN_LENGTH}
            value={mfaToken}
            onChange={ev => setMfaToken(ev.target.value.replace(/\D/g, '').slice(0, MFA_TOKEN_LENGTH))}
            onKeyDown={ev => {
 if (ev.key === ENTER_KEY) {
void handleMfaVerify();
} 
}}
            placeholder="000000"
            disabled={mfaLoading}
            aria-label={t('admin.mfa.tokenLabel')}
            style={{
              width: '140px',
              padding: '4px 8px',
              borderRadius: theme.borderRadius.sm,
              border: `1px solid ${mfaError ? (theme.colors.feedback?.error ?? '#d32f2f') : (theme.colors.border?.default ?? '#e0e0e0')}`,
              fontSize: theme.typography.fontSize.lg,
              letterSpacing: '0.3em',
              textAlign: 'center',
              display: 'block',
              marginBottom: theme.spacing.xs,
            }}
          />
          {mfaError && (
            <p role="alert" style={{ color: theme.colors.feedback?.error ?? '#d32f2f', fontSize: theme.typography.fontSize.xs, marginBottom: theme.spacing.xs }}>
              {mfaError}
            </p>
          )}
          <button
            type="button"
            onClick={() => void handleMfaVerify()}
            disabled={mfaLoading || mfaToken.length !== MFA_TOKEN_LENGTH}
            style={{
              backgroundColor: mfaLoading || mfaToken.length !== MFA_TOKEN_LENGTH ? theme.colors.text.tertiary : theme.colors.primary.main,
              color: COLOR_WHITE,
              border: 'none',
              borderRadius: theme.borderRadius.sm,
              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
              cursor: mfaLoading || mfaToken.length !== MFA_TOKEN_LENGTH ? 'not-allowed' : 'pointer',
              fontSize: theme.typography.fontSize.xs,
            }}
          >
            {mfaLoading ? t('common.loading') : t('admin.mfa.verify')}
          </button>
        </div>
      )}

      {mfaState === MFA_STATES.NONE && (
      <>
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
        <strong>localStorage raw:</strong> <span style={VALUE_STYLE}>{rawLocalStorage ?? '(not set)'}</span>
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
              {entry.ageMs !== null ? `${formatMs(entry.ageMs)} old` : 'no timestamp'}
            </span>
          ))
        )}
      </div>

      {error && (
        <div style={{ color: theme.colors.error?.main ?? 'red', marginBottom: theme.spacing.sm }}>Error: {error}</div>
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
                  const total =
                    buckets.veryHigh +
                    buckets.high +
                    buckets.medium +
                    buckets.low +
                    buckets.veryLow +
                    buckets.unprioritised;
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
      </>
      )}
    </div>
  );
};
