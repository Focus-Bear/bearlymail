import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { IssueResultItem } from 'components/quick-actions/modals/github/IssueResultItem';

interface IssueResult {
  url: string;
  title: string;
  repository: string;
  number: number;
  state: string;
  body?: string;
}

interface IssueResultsListProps {
  results: IssueResult[];
  loading: boolean;
  query: string;
  error: string;
}

export const IssueResultsList: React.FC<IssueResultsListProps> = ({ results, loading, query, error }) => {
  const { t } = useTranslation();

  if (loading) {
    return null;
  }

  if (results.length > 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
        <div
          style={{
            color: theme.colors.text.secondary,
            fontSize: theme.typography.fontSize.sm,
            marginBottom: theme.spacing.sm,
          }}
        >
          {t('quickActions.github.foundIssues', { count: results.length })}
        </div>
        {results.map(issue => (
          <IssueResultItem key={`${issue.repository}-${issue.number}-${issue.url}`} issue={issue} />
        ))}
      </div>
    );
  }

  if (query && !error) {
    return (
      <div
        style={{
          padding: theme.spacing.lg,
          textAlign: 'center',
          color: theme.colors.text.secondary,
        }}
      >
        {t('quickActions.github.noIssuesFound')}
      </div>
    );
  }

  return null;
};
