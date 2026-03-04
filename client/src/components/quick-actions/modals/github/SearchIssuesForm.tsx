import React from 'react';
import { theme } from 'theme/theme';

import { COLOR_NAMED_WHITE } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

interface SearchIssuesFormProps {
  query: string;
  loading: boolean;
  onQueryChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export const SearchIssuesForm: React.FC<SearchIssuesFormProps> = ({
  query,
  loading,
  onQueryChange,
  onSubmit,
}) => {
  return (
    <form onSubmit={onSubmit} style={{ marginBottom: theme.spacing.lg }}>
      <div style={{ display: 'flex', gap: theme.spacing.sm }}>
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search query (e.g., 'bug login error')"
          style={{
            flex: 1,
            padding: theme.spacing.sm,
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.md,
            fontSize: theme.typography.fontSize.base,
          }}
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          style={{
            padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
            backgroundColor: loading || !query.trim() ? theme.colors.border.medium : theme.colors.primary.main,
            color: COLOR_NAMED_WHITE,
            border: STRING_NONE,
            borderRadius: theme.borderRadius.md,
            cursor: loading || !query.trim() ? 'not-allowed' : 'pointer',
            fontWeight: theme.typography.fontWeight.semibold,
          }}
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>
    </form>
  );
};






