import React from 'react';
import { theme } from 'theme/theme';

interface EmailLabelsProps {
  labels: string[];
}

const SYSTEM_LABELS = new Set([
  'INBOX',
  'UNREAD',
  'STARRED',
  'IMPORTANT',
  'SENT',
  'DRAFT',
  'TRASH',
  'SPAM',
  'CATEGORY_PERSONAL',
  'CATEGORY_SOCIAL',
  'CATEGORY_PROMOTIONS',
  'CATEGORY_UPDATES',
  'CATEGORY_FORUMS',
  'GREEN_CIRCLE',
  'BLUE_STAR',
  'YELLOW_STAR',
  'RED_BANG',
  'YELLOW_BANG',
  'PURPLE_QUESTION',
  'ORANGE_GUILLEMET',
  'BLUE_INFO',
  'RED_MINUS',
  'YELLOW_MINUS',
  'GREEN_CHECK',
  'BLUE_CHECK',
  'RED_CHECK',
  'ORANGE_CHECK',
]);

export const EmailLabels: React.FC<EmailLabelsProps> = ({ labels }) => {
  if (!labels || labels.length === 0) {
    return null;
  }

  // Filter out system labels and Label_* patterns (unmapped label IDs)
  const filteredLabels = labels.filter(label => {
    // Skip system labels
    if (SYSTEM_LABELS.has(label)) {
      return false;
    }
    // Skip unmapped Label_* patterns (these are label IDs that couldn't be converted)
    if (label.startsWith('Label_') || label.startsWith('label_')) {
      return false;
    }
    return true;
  });

  // Deduplicate labels
  const uniqueFilteredLabels = Array.from(new Set(filteredLabels));

  if (uniqueFilteredLabels.length === 0) {
    return null;
  }

  const getLabelKey = (label: string, index: number): string => {
    return `label-${label}-${index}`;
  };

  return (
    <div style={{ display: 'flex', gap: theme.spacing.xs, flexWrap: 'wrap' }}>
      {uniqueFilteredLabels.map((label, index) => {
        const displayLabel = label.startsWith('CATEGORY_') ? label.replace('CATEGORY_', '') : label;
        const isCategory = label.startsWith('CATEGORY_');
        return (
          <span
            key={getLabelKey(label, index)}
            style={{
              fontSize: theme.typography.fontSize.sm,
              padding: `2px ${theme.spacing.sm}`,
              backgroundColor: isCategory ? theme.colors.background.subtle : theme.colors.primary.subtle,
              color: isCategory ? theme.colors.text.secondary : theme.colors.primary.main,
              borderRadius: theme.borderRadius.sm,
              border: `1px solid ${isCategory ? theme.colors.border.light : 'transparent'}`,
              textTransform: isCategory ? 'capitalize' : 'none',
            }}
          >
            {displayLabel.toLowerCase()}
          </span>
        );
      })}
    </div>
  );
};
