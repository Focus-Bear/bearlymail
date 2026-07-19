import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_NAMED_WHITE } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

interface SearchFormProps {
  query: string;
  loading: boolean;
  onQueryChange: (query: string) => void;
  onSubmit: (event: React.FormEvent) => void;
}

export const SearchForm: React.FC<SearchFormProps> = ({ query, loading, onQueryChange, onSubmit }) => {
  const { t } = useTranslation();

  return (
    <form onSubmit={onSubmit} style={{ marginBottom: theme.spacing.xl }}>
      <div
        style={{
          display: 'flex',
          gap: theme.spacing.md,
          alignItems: 'center',
        }}
      >
        <input
          type="text"
          value={query}
          onChange={event => onQueryChange(event.target.value)}
          placeholder={t('search.placeholder')}
          style={{
            flex: 1,
            padding: theme.spacing.md,
            border: `2px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.md,
            fontSize: theme.typography.fontSize.base,
            fontFamily: theme.typography.fontFamily,
          }}
          autoFocus
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          style={{
            padding: `${theme.spacing.md} ${theme.spacing.xl}`,
            backgroundColor: loading || !query.trim() ? theme.colors.text.tertiary : theme.colors.primary.main,
            color: COLOR_NAMED_WHITE,
            border: STRING_NONE,
            borderRadius: theme.borderRadius.md,
            cursor: loading || !query.trim() ? 'not-allowed' : 'pointer',
            fontSize: theme.typography.fontSize.base,
            fontWeight: theme.typography.fontWeight.medium,
          }}
        >
          {loading ? t('search.searching') : t('search.search')}
        </button>
      </div>
      <p
        style={{
          marginTop: theme.spacing.sm,
          fontSize: theme.typography.fontSize.lg,
          color: theme.colors.text.secondary,
        }}
      >
        {t('search.hint')}
      </p>
    </form>
  );
};
