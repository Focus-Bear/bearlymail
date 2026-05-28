/* eslint-disable i18next/no-literal-string */
// Admin-only debug panel — labels are never localised.

import React, { useState } from 'react';
import axios from 'axios';
import { theme } from 'theme/theme';
import { InboxMode } from 'types/email';

import { API_URL } from 'config/api';
import { CategorySummaryItem } from 'store/slices/emailSlice';

const STATUS_IDLE = 'idle' as const;
const STATUS_LOADING = 'loading' as const;
const STATUS_SUCCESS = 'success' as const;
const STATUS_ERROR = 'error' as const;

/**
 * Admin-only diagnostic panel rendered beneath any category accordion whose
 * local email list is empty (issue #2062). Surfaces the client-side state that
 * controls the hide-guard plus the raw summary entries that share this
 * category's display name, then exposes two server probes:
 *
 *   - `GET /emails/debug/category-contexts` — every EMAIL_CATEGORY UserContext
 *     for the caller, parsed and grouped by name. Reveals duplicate rows that
 *     parse to different names because of separator mismatches
 *     (e.g. "Name - Desc" vs "Name: Desc").
 *   - `GET /emails/debug/category-fetch-trace` — replays the inbox pipeline
 *     for this category and reports per-stage thread IDs + drop reasons.
 *
 * Only ever mounted when the parent has already verified `user.isAdmin`.
 */

interface CategoryDebugPanelProps {
  categoryItem: { id: string | null; name: string; count: number };
  categoryKey: string;
  categoryEmailsLength: number;
  isLoaded: boolean;
  isExpanded: boolean;
  categorySummary: CategorySummaryItem[] | null;
  mode: InboxMode;
}

type LoadState<T> =
  | { status: typeof STATUS_IDLE }
  | { status: typeof STATUS_LOADING }
  | { status: typeof STATUS_SUCCESS; payload: T }
  | { status: typeof STATUS_ERROR; message: string };

const monospace: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: '11px',
};

const Pill: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: theme.spacing.xs,
      padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
      borderRadius: theme.borderRadius.sm,
      backgroundColor: theme.colors.background.subtle,
      border: `1px solid ${theme.colors.border.light}`,
      ...monospace,
    }}
  >
    <span style={{ color: theme.colors.text.tertiary }}>{label}</span>
    <strong style={{ color: theme.colors.text.primary }}>{value}</strong>
  </span>
);

const JsonBlock: React.FC<{ value: unknown }> = ({ value }) => (
  <pre
    style={{
      backgroundColor: theme.colors.background.subtle,
      padding: theme.spacing.md,
      borderRadius: theme.borderRadius.md,
      maxHeight: 320,
      overflow: 'auto',
      ...monospace,
    }}
  >
    {JSON.stringify(value, null, 2)}
  </pre>
);

async function fetchJson<T>(url: string, setState: (state: LoadState<T>) => void): Promise<void> {
  setState({ status: STATUS_LOADING });
  try {
    const response = await axios.get<T>(url);
    setState({ status: STATUS_SUCCESS, payload: response.data });
  } catch (err) {
    const message =
      axios.isAxiosError(err) && err.response
        ? `${err.response.status} ${err.response.statusText}: ${JSON.stringify(err.response.data)}`
        : (err as Error).message;
    setState({ status: STATUS_ERROR, message });
  }
}

export const CategoryDebugPanel: React.FC<CategoryDebugPanelProps> = ({
  categoryItem,
  categoryKey,
  categoryEmailsLength,
  isLoaded,
  isExpanded,
  categorySummary,
  mode,
}) => {
  const [contexts, setContexts] = useState<LoadState<unknown>>({ status: STATUS_IDLE });
  const [trace, setTrace] = useState<LoadState<unknown>>({ status: STATUS_IDLE });

  // Summary entries that share this category's display name. If more than one
  // shows up the inbox is being fed duplicate categories with distinct UUIDs —
  // the most common root cause of ghost-empty accordions.
  const matchingByName = (categorySummary ?? []).filter((entry) => entry.name === categoryItem.name);
  const matchingById = (categorySummary ?? []).filter((entry) => entry.id === categoryItem.id);

  const traceCategoryId = categoryItem.id ?? 'uncategorized';
  const traceUrl = `${API_URL}/emails/debug/category-fetch-trace?categoryId=${encodeURIComponent(traceCategoryId)}&mode=${encodeURIComponent(mode)}`;
  const contextsUrl = `${API_URL}/emails/debug/category-contexts`;

  return (
    <div
      style={{
        margin: `${theme.spacing.xs} 0 ${theme.spacing.md} 0`,
        padding: theme.spacing.md,
        border: `1px dashed ${theme.colors.accent.warning}`,
        borderRadius: theme.borderRadius.md,
        backgroundColor: theme.colors.background.subtle,
      }}
      data-testid="category-debug-panel"
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.sm,
          marginBottom: theme.spacing.sm,
          color: theme.colors.text.secondary,
          fontSize: theme.typography.fontSize.sm,
          fontWeight: theme.typography.fontWeight.semibold,
        }}
      >
        <span>Admin debug — empty category</span>
        <span style={{ color: theme.colors.text.tertiary, fontWeight: theme.typography.fontWeight.normal }}>
          (issue #2062)
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.xs, marginBottom: theme.spacing.sm }}>
        <Pill label="id" value={categoryItem.id ?? 'null'} />
        <Pill label="key" value={categoryKey} />
        <Pill label="summary.count" value={categoryItem.count} />
        <Pill label="emails.length" value={categoryEmailsLength} />
        <Pill label="isLoaded" value={String(isLoaded)} />
        <Pill label="isExpanded" value={String(isExpanded)} />
        <Pill label="mode" value={mode} />
      </div>

      {matchingByName.length !== 1 && (
        <div
          style={{
            marginBottom: theme.spacing.sm,
            padding: theme.spacing.sm,
            borderRadius: theme.borderRadius.sm,
            backgroundColor: theme.colors.background.paper,
            color: theme.colors.accent.error,
            ...monospace,
          }}
        >
          <strong>{matchingByName.length}</strong> raw summary entries match name "{categoryItem.name}".{' '}
          {matchingByName.length > 1
            ? 'Duplicate display names with different UUIDs — likely the root cause.'
            : 'No raw summary entry — this category is in displayCategories from a non-summary source.'}
        </div>
      )}

      <details style={{ marginBottom: theme.spacing.xs }}>
        <summary
          style={{
            cursor: 'pointer',
            color: theme.colors.text.secondary,
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          Raw summary entries ({matchingByName.length} by name, {matchingById.length} by id)
        </summary>
        <JsonBlock value={{ matchingByName, matchingById }} />
      </details>

      <details
        style={{ marginBottom: theme.spacing.xs }}
        onToggle={(event) => {
          if (
            (event.currentTarget as HTMLDetailsElement).open &&
            (contexts.status === STATUS_IDLE || contexts.status === STATUS_ERROR)
          ) {
            void fetchJson(contextsUrl, setContexts);
          }
        }}
      >
        <summary
          style={{
            cursor: 'pointer',
            color: theme.colors.text.secondary,
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          All EMAIL_CATEGORY contexts (server)
        </summary>
        {contexts.status === STATUS_LOADING && (
          <div style={{ padding: theme.spacing.sm, color: theme.colors.text.tertiary }}>Loading…</div>
        )}
        {contexts.status === STATUS_ERROR && (
          <div style={{ padding: theme.spacing.sm, color: theme.colors.accent.error, ...monospace }}>
            {contexts.message}
          </div>
        )}
        {contexts.status === STATUS_SUCCESS && <JsonBlock value={contexts.payload} />}
      </details>

      <details
        onToggle={(event) => {
          if (
            (event.currentTarget as HTMLDetailsElement).open &&
            (trace.status === STATUS_IDLE || trace.status === STATUS_ERROR)
          ) {
            void fetchJson(traceUrl, setTrace);
          }
        }}
      >
        <summary
          style={{
            cursor: 'pointer',
            color: theme.colors.text.secondary,
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          Category fetch trace ({mode}, id={traceCategoryId})
        </summary>
        {trace.status === STATUS_LOADING && (
          <div style={{ padding: theme.spacing.sm, color: theme.colors.text.tertiary }}>Loading…</div>
        )}
        {trace.status === STATUS_ERROR && (
          <div style={{ padding: theme.spacing.sm, color: theme.colors.accent.error, ...monospace }}>
            {trace.message}
          </div>
        )}
        {trace.status === STATUS_SUCCESS && <JsonBlock value={trace.payload} />}
      </details>
    </div>
  );
};
