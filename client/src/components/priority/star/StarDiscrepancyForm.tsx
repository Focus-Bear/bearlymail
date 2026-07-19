import React from 'react';
import { theme } from 'theme/theme';

interface StarDiscrepancyFormProps {
  explanation: string;
  onExplanationChange: (value: string) => void;
}

export const StarDiscrepancyForm: React.FC<StarDiscrepancyFormProps> = ({ explanation, onExplanationChange }) => {
  return (
    <textarea
      value={explanation}
      onChange={event => onExplanationChange(event.target.value)}
      placeholder="e.g., This is from my manager, This relates to an urgent deadline, This is just a newsletter..."
      style={{
        width: '100%',
        padding: theme.spacing.sm,
        border: `1px solid ${theme.colors.border.medium}`,
        borderRadius: theme.borderRadius.md,
        fontSize: theme.typography.fontSize.sm,
        fontFamily: theme.typography.fontFamily,
        resize: 'vertical',
        minHeight: '100px',
        marginBottom: theme.spacing.md,
      }}
    />
  );
};
