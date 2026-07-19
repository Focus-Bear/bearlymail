import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

interface CommentTextareaProps {
  value: string;
  onChange: (value: string) => void;
}

export const CommentTextarea: React.FC<CommentTextareaProps> = ({ value, onChange }) => {
  const { t } = useTranslation();

  return (
    <div style={{ marginBottom: theme.spacing.lg }}>
      <label
        style={{
          display: 'block',
          marginBottom: theme.spacing.xs,
          color: theme.colors.text.primary,
          fontWeight: theme.typography.fontWeight.medium,
        }}
      >
        {t('quickActions.github.commentLabel')} *
      </label>
      <textarea
        value={value}
        onChange={event => onChange(event.target.value)}
        rows={8}
        required
        style={{
          width: '100%',
          padding: theme.spacing.sm,
          border: `1px solid ${theme.colors.border.medium}`,
          borderRadius: theme.borderRadius.md,
          fontSize: theme.typography.fontSize.base,
          fontFamily: theme.typography.fontFamily,
          resize: 'vertical',
        }}
      />
    </div>
  );
};
