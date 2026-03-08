import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

interface IssueInfoDisplayProps {
  owner: string;
  repo: string;
  number: number;
}

export const IssueInfoDisplay: React.FC<IssueInfoDisplayProps> = ({ owner, repo, number }) => {
  const { t } = useTranslation();

  return (
    <div style={{ marginBottom: theme.spacing.md }}>
      <div
        style={{
          color: theme.colors.text.secondary,
          fontSize: theme.typography.fontSize.sm,
          marginBottom: theme.spacing.md,
        }}
      >
        {t('quickActions.github.issue', { owner, repo, number })}
      </div>
    </div>
  );
};
