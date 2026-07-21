/*
 * Admin tab placement of the contact-search diagnostic. Labels are field
 * names shared with the backend; see ContactSearchDebugView for the rule
 * justification.
 */
/* eslint-disable i18next/no-literal-string */
import React from 'react';
import { theme } from 'theme/theme';

import { ContactSearchDebugView } from './ContactSearchDebugView';
import { useContactSearchDebug } from './useContactSearchDebug';

const DISABLED_OPACITY = 0.6;
const RUN_LABEL_BUSY = 'Running…';
const RUN_LABEL_IDLE = 'Run diagnostic';

const monospace: React.CSSProperties = {
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  fontSize: '0.85rem',
};

const card: React.CSSProperties = {
  padding: theme.spacing.lg,
  marginBottom: theme.spacing.lg,
  backgroundColor: theme.colors.background.paper,
  border: `1px solid ${theme.colors.border.light}`,
  borderRadius: 6,
};

const fieldLabel: React.CSSProperties = {
  display: 'block',
  marginBottom: theme.spacing.xs,
  fontWeight: theme.typography.fontWeight.medium,
  color: theme.colors.text.primary,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 480,
  padding: theme.spacing.sm,
  border: `1px solid ${theme.colors.border.medium}`,
  borderRadius: 4,
  ...monospace,
};

export const ContactSearchDebugSection: React.FC = () => {
  const { query, setQuery, targetEmail, setTargetEmail, loading, error, result, handleSubmit, runAgain } =
    useContactSearchDebug();

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
        Contact search debug
      </h2>
      <p style={{ color: theme.colors.text.secondary, marginBottom: theme.spacing.lg, maxWidth: 720 }}>
        Dumps the full anatomy of <code>/contacts/search</code> for your own account: query tokens, SQL candidate
        set, post-filter decisions, Gmail fallback, and a target-contact lookup that shows whether a specific
        contact&apos;s stored <code>searchTokens</code> contain the expected hashes. Also available inline on the
        Contacts page when you&apos;re searching.
      </p>

      <form onSubmit={handleSubmit} style={card}>
        <div style={{ marginBottom: theme.spacing.md }}>
          <label htmlFor="contact-debug-query" style={fieldLabel}>
            Search query (what the user typed)
          </label>
          <input
            id="contact-debug-query"
            type="text"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="e.g. kyriak"
            style={inputStyle}
            autoComplete="off"
          />
        </div>
        <div style={{ marginBottom: theme.spacing.md }}>
          <label htmlFor="contact-debug-target" style={fieldLabel}>
            Target contact email (optional — the contact you expect to find)
          </label>
          <input
            id="contact-debug-target"
            type="email"
            value={targetEmail}
            onChange={event => setTargetEmail(event.target.value)}
            placeholder="e.g. casey@example.com"
            style={inputStyle}
            autoComplete="off"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
            backgroundColor: theme.colors.primary.main,
            color: theme.colors.common.white,
            border: 'none',
            borderRadius: 4,
            cursor: loading ? 'not-allowed' : 'pointer',
            fontWeight: theme.typography.fontWeight.semibold,
            opacity: loading ? DISABLED_OPACITY : 1,
          }}
        >
          {loading ? RUN_LABEL_BUSY : RUN_LABEL_IDLE}
        </button>
      </form>

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

      {result && <ContactSearchDebugView result={result} onRefresh={() => void runAgain()} />}
    </div>
  );
};
