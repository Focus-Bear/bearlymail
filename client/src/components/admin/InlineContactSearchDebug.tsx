/*
 * Inline placement of the contact-search diagnostic on the Contacts page.
 * Renders only for admins and only when there's a meaningful query, so it
 * doesn't intrude on normal use. Same `ContactSearchDebugView` underneath
 * as the admin dashboard tab — kept in lockstep via the shared component.
 */
/* eslint-disable i18next/no-literal-string, max-lines-per-function */
import React, { useCallback, useState } from 'react';
import { theme } from 'theme/theme';

import { useAuth } from 'contexts/AuthContext';

import { ContactSearchDebugView } from './ContactSearchDebugView';
import { useContactSearchDebugRunner } from './useContactSearchDebug';

const DISABLED_OPACITY = 0.6;
const MIN_QUERY_LENGTH = 2;
const RUN_LABEL_BUSY = 'Running…';
const RUN_LABEL_IDLE = 'Run diagnostic';

const monospace: React.CSSProperties = {
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  fontSize: '0.85rem',
};

interface InlineContactSearchDebugProps {
  /** The current value of the Contacts page search box. */
  query: string;
}

export const InlineContactSearchDebug: React.FC<InlineContactSearchDebugProps> = ({ query }) => {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [targetEmail, setTargetEmail] = useState('');
  const { loading, error, result, run, runAgain } = useContactSearchDebugRunner();

  const trimmedQuery = query.trim();
  const canRun = trimmedQuery.length >= MIN_QUERY_LENGTH;

  const handleRun = useCallback(() => {
    void run(trimmedQuery, targetEmail);
  }, [run, trimmedQuery, targetEmail]);

  if (!user?.isAdmin || !canRun) {
    return null;
  }

  return (
    <div
      style={{
        border: `1px dashed ${theme.colors.border.medium}`,
        borderRadius: 6,
        padding: theme.spacing.sm,
        marginBottom: theme.spacing.md,
        backgroundColor: theme.colors.background.default,
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded(prev => !prev)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.sm,
          width: '100%',
          padding: 0,
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          fontSize: theme.typography.fontSize.sm,
          color: theme.colors.text.secondary,
          fontWeight: theme.typography.fontWeight.medium,
        }}
        aria-expanded={expanded}
      >
        <span aria-hidden="true">{expanded ? '▾' : '▸'}</span>
        <span>
          <b>Admin debug:</b> inspect this contact search (q=<code style={monospace}>{trimmedQuery}</code>)
        </span>
      </button>

      {expanded && (
        <div style={{ marginTop: theme.spacing.sm }}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: theme.spacing.sm,
              alignItems: 'flex-end',
              marginBottom: theme.spacing.sm,
            }}
          >
            <div style={{ flex: '1 1 280px', minWidth: 220 }}>
              <label
                htmlFor="inline-debug-target"
                style={{
                  display: 'block',
                  fontSize: theme.typography.fontSize.xs,
                  color: theme.colors.text.secondary,
                  marginBottom: theme.spacing.xs,
                }}
              >
                Target contact email (optional — the contact you expect to find)
              </label>
              <input
                id="inline-debug-target"
                type="email"
                value={targetEmail}
                onChange={event => setTargetEmail(event.target.value)}
                placeholder="e.g. alex@example.com"
                style={{
                  width: '100%',
                  padding: theme.spacing.sm,
                  border: `1px solid ${theme.colors.border.medium}`,
                  borderRadius: 4,
                  ...monospace,
                }}
                autoComplete="off"
              />
            </div>
            <button
              type="button"
              onClick={handleRun}
              disabled={loading}
              style={{
                padding: `${theme.spacing.sm} ${theme.spacing.md}`,
                backgroundColor: theme.colors.primary.main,
                color: theme.colors.common.white,
                border: 'none',
                borderRadius: 4,
                cursor: loading ? 'not-allowed' : 'pointer',
                fontWeight: theme.typography.fontWeight.semibold,
                opacity: loading ? DISABLED_OPACITY : 1,
                whiteSpace: 'nowrap',
              }}
            >
              {loading ? RUN_LABEL_BUSY : RUN_LABEL_IDLE}
            </button>
          </div>

          {error && (
            <div
              role="alert"
              style={{
                padding: theme.spacing.sm,
                marginBottom: theme.spacing.sm,
                backgroundColor: theme.colors.error.light,
                color: theme.colors.error.main,
                borderRadius: 4,
                fontSize: theme.typography.fontSize.sm,
              }}
            >
              {error}
            </div>
          )}

          {result && <ContactSearchDebugView result={result} onRefresh={() => void runAgain()} />}
        </div>
      )}
    </div>
  );
};
