import React from 'react';
import { theme } from 'theme/theme';

interface Label {
  name: string;
  color: string;
}

interface GitHubLabelsProps {
  labels: Label[];
}

export const GitHubLabels: React.FC<GitHubLabelsProps> = ({ labels }) => {
  if (!labels || labels.length === 0) {
    return null;
  }

  return (
    <div style={{ display: 'flex', gap: theme.spacing.xs, flexWrap: 'wrap', marginBottom: theme.spacing.sm }}>
      {labels.map(label => (
        <span
          key={`label-${label.name}-${label.color}`}
          style={{
            fontSize: theme.typography.fontSize.xs,
            padding: `2px ${theme.spacing.sm}`,
            backgroundColor: `#${label.color || '000000'}20`,
            color: `#${label.color || '000000'}`,
            borderRadius: theme.borderRadius.sm,
            border: `1px solid #${label.color || '000000'}40`,
            fontWeight: theme.typography.fontWeight.medium,
          }}
        >
          {label.name}
        </span>
      ))}
    </div>
  );
};
