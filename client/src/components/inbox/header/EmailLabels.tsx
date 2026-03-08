import React from 'react';
import { theme } from 'theme/theme';

interface EmailLabelsProps {
  labels: string[];
}

export const EmailLabels: React.FC<EmailLabelsProps> = ({ labels }) => {
  if (!labels || labels.length === 0) {
    return null;
  }

  // Filter out system labels and Label_* patterns (unmapped label IDs)
  const systemLabels = new Set([
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

  const filteredLabels = labels.filter(label => {
    // Skip system labels
    if (systemLabels.has(label)) {
      return false;
    }
    // Skip unmapped Label_* patterns (these are label IDs that couldn't be converted)
    if (label.startsWith('Label_') || label.startsWith('label_')) {
      return false;
    }
    return true;
  });

  // Deduplicate labels to avoid duplicate keys and UI elements
  const uniqueLabels = Array.from(new Set(filteredLabels));

  if (uniqueLabels.length === 0) {
    return null;
  }

  return (
    <div style={{ display: 'flex', gap: theme.spacing.xs, flexWrap: 'wrap' }}>
      {uniqueLabels.map(label => {
        const displayLabel = label.startsWith('CATEGORY_') ? label.replace('CATEGORY_', '') : label;
        const isCategory = label.startsWith('CATEGORY_');
        return (
          <span
            key={`label-${label}`}
            style={{
              fontSize: theme.typography.fontSize.xs,
              padding: `2px ${theme.spacing.sm}`,
              backgroundColor: isCategory ? theme.colors.background.subtle : theme.colors.primary.subtle,
              color: theme.colors.text.secondary,
              borderRadius: theme.borderRadius.sm,
              border: `1px solid ${theme.colors.border.medium}`,
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
