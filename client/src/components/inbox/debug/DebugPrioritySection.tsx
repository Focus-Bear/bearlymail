/**
 * DebugPrioritySection — shows current priority filter state, bucket distribution,
 * unprioritised count, and localStorage cache state for the active inbox mode.
 *
 * Rendered inside DebugPanel; has no side effects (read-only display).
 *
 * Author: Captain Codebeard (AI)
 * Implements: #1571 Feature — Priority debug section (P3)
 */
import React, { useMemo } from 'react';
import { theme } from 'theme/theme';
import { InboxMode } from 'types/email';
import { CACHE_VERSION, serialiseFilterParams } from 'utils/emailCache';

import { PRIORITY_BUCKET_DEFS } from 'constants/priorityBuckets';
import { InboxFilter } from 'hooks/useInboxFilters';
import { PriorityCounts } from 'hooks/usePriorityCounts';

export interface DebugPrioritySectionProps {
  /** Current active inbox mode. */
  mode: InboxMode;
  /** Current priority filter values from useInboxFilters. */
  filters: InboxFilter;
  /** Priority bucket counts from usePriorityCounts. null while loading. */
  priorityCounts: PriorityCounts | null;
}

// ── Color constants ───────────────────────────────────────────────────────────
// Named constants for colors not yet represented in theme/theme.ts.
// These replace raw hex/rgba magic strings and serve as a single point of truth.

/** Subtle indigo tint used as the debug panel container background. */
const DEBUG_PANEL_BG = 'rgba(99,102,241,0.05)';
/** Indigo border used around the debug panel container. */
const DEBUG_PANEL_BORDER = 'rgba(99,102,241,0.2)';
/** Very light dark overlay used as the sub-section box background. */
const SECTION_BOX_BG = 'rgba(0,0,0,0.04)';
/** Colour applied to the cache-hit indicator. */
const CACHE_HIT_COLOR = theme.colors.success.main;
/** Colour applied to the cache-miss indicator. */
const CACHE_MISS_COLOR = theme.colors.error.dark;
/** Colour applied to the unprioritised count warning badge. */
const UNPRIORITISED_WARN_COLOR = theme.colors.warning.main;

// ── Helpers ───────────────────────────────────────────────────────────────────

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;

function describePriorityRange(min: number | null, max: number | null): string {
  if (min === null && max === null) {
    return 'All priorities';
  }
  if (min !== null && max === null) {
    return `≥ ${min} (min only)`;
  }
  if (min === null && max !== null) {
    return `≤ ${max} (max only)`;
  }
  return `${min} – ${max}`;
}

function bucketLabelForRange(min: number | null, max: number | null): string {
  const matched = PRIORITY_BUCKET_DEFS.find(def => def.min === min && def.max === max);
  return matched?.label ?? 'Custom';
}

interface CacheInfo {
  exists: boolean;
  ageMs: number | null;
  filterKey: string;
}

function readSummaryCacheInfo(mode: InboxMode, filters: InboxFilter): CacheInfo {
  const filterKey = serialiseFilterParams({
    minPriority: filters.minPriority,
    maxPriority: filters.maxPriority,
    categories: filters.categories,
    accountIds: filters.accountIds,
  });
  const storageKey = `bearlymail_${CACHE_VERSION}_summary_${mode}_${filterKey}`;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return { exists: false, ageMs: null, filterKey };
    }
    const entry = JSON.parse(raw) as { timestamp?: number };
    const ageMs = entry.timestamp !== undefined ? Date.now() - entry.timestamp : null;
    return { exists: true, ageMs, filterKey };
  } catch {
    return { exists: false, ageMs: null, filterKey };
  }
}

function formatAge(ageMs: number | null): string {
  if (ageMs === null) {
    return 'unknown age';
  }
  const secs = Math.round(ageMs / MS_PER_SECOND);
  if (secs < SECONDS_PER_MINUTE) {
    return `${secs}s old`;
  }
  return `${Math.round(secs / SECONDS_PER_MINUTE)}m old`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

const Row: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div style={{ display: 'flex', gap: theme.spacing.sm, marginBottom: '2px' }}>
    <span style={{ color: theme.colors.text.tertiary, minWidth: '120px' }}>{label}:</span>
    <span style={{ color: theme.colors.text.primary, fontWeight: theme.typography.fontWeight.medium }}>{value}</span>
  </div>
);

const SectionBox: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div
    style={{
      marginBottom: theme.spacing.sm,
      padding: theme.spacing.sm,
      backgroundColor: SECTION_BOX_BG,
      borderRadius: theme.borderRadius.sm,
      border: `1px solid ${theme.colors.border.light}`,
    }}
  >
    <div
      style={{
        fontWeight: theme.typography.fontWeight.semibold,
        marginBottom: theme.spacing.xs,
        fontSize: theme.typography.fontSize.xs,
        color: theme.colors.text.secondary,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}
    >
      {title}
    </div>
    {children}
  </div>
);

interface BucketRowDef {
  label: string;
  count: number;
  color: string;
}

const BucketBar: React.FC<{ counts: PriorityCounts }> = ({ counts }) => {
  const buckets: BucketRowDef[] = useMemo(
    () => [
      { label: 'Very High', count: counts.veryHigh, color: theme.colors.priorityBuckets.veryHigh },
      { label: 'High', count: counts.high, color: theme.colors.priorityBuckets.high },
      { label: 'Medium', count: counts.medium, color: theme.colors.priorityBuckets.medium },
      { label: 'Low', count: counts.low, color: theme.colors.priorityBuckets.low },
      { label: 'Very Low', count: counts.veryLow, color: theme.colors.priorityBuckets.veryLow },
    ],
    [counts]
  );

  return (
    <div>
      {buckets.map(bucket => (
        <Row
          key={bucket.label}
          label={bucket.label}
          value={
            <span>
              <span
                style={{
                  display: 'inline-block',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: bucket.color,
                  marginRight: '4px',
                  verticalAlign: 'middle',
                }}
              />
              {bucket.count}
            </span>
          }
        />
      ))}
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

export const DebugPrioritySection: React.FC<DebugPrioritySectionProps> = ({
  mode,
  filters,
  priorityCounts,
}) => {
  const cacheInfo = useMemo(() => readSummaryCacheInfo(mode, filters), [mode, filters]);
  const rangeLabel = bucketLabelForRange(filters.minPriority, filters.maxPriority);

  return (
    <div
      style={{
        marginBottom: theme.spacing.md,
        padding: theme.spacing.sm,
        backgroundColor: DEBUG_PANEL_BG,
        borderRadius: theme.borderRadius.sm,
        border: `1px solid ${DEBUG_PANEL_BORDER}`,
        fontSize: theme.typography.fontSize.xs,
        fontFamily: 'monospace',
      }}
    >
      <h4 style={{ margin: `0 0 ${theme.spacing.sm} 0`, color: theme.colors.text.primary }}>
        🔢 Priority Debug
      </h4>

      <SectionBox title="Active Filter">
        <Row label="Range" value={describePriorityRange(filters.minPriority, filters.maxPriority)} />
        <Row label="Bucket" value={rangeLabel} />
        <Row label="minPriority" value={filters.minPriority === null ? 'null' : String(filters.minPriority)} />
        <Row label="maxPriority" value={filters.maxPriority === null ? 'null' : String(filters.maxPriority)} />
        {filters.categories.length > 0 && (
          <Row label="Categories" value={filters.categories.join(', ')} />
        )}
        {filters.accountIds.length > 0 && (
          <Row label="Accounts" value={filters.accountIds.join(', ')} />
        )}
      </SectionBox>

      <SectionBox title="Priority Distribution">
        {priorityCounts !== null ? (
          <>
            <BucketBar counts={priorityCounts} />
            <Row
              label="Unprioritised"
              value={
                <span style={{ color: priorityCounts.unprioritised > 0 ? UNPRIORITISED_WARN_COLOR : 'inherit' }}>
                  {priorityCounts.unprioritised}
                  {priorityCounts.unprioritised > 0 ? ' ⏳' : ''}
                </span>
              }
            />
          </>
        ) : (
          <span style={{ color: theme.colors.text.tertiary }}>Loading…</span>
        )}
      </SectionBox>

      <SectionBox title="Summary Cache">
        <Row label="Mode" value={mode} />
        <Row label="Filter key" value={cacheInfo.filterKey} />
        <Row
          label="Cached"
          value={
            cacheInfo.exists ? (
              <span style={{ color: CACHE_HIT_COLOR }}>
                ✓ hit ({formatAge(cacheInfo.ageMs)})
              </span>
            ) : (
              <span style={{ color: CACHE_MISS_COLOR }}>✗ miss</span>
            )
          }
        />
      </SectionBox>
    </div>
  );
};
