import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { MAX_OPTION_LENGTH, MAX_TEXTAREA_HEIGHT_PX } from 'constants/numbers';

interface ReplyOption {
  label: string;
  text: string;
}

interface ReplyOptionsSelectorProps {
  loadingReplies: boolean;
  replyOptions: ReplyOption[] | null;
  selectedReplyOption: number;
  onSelect: (index: number, text: string) => void;
}

export const ReplyOptionsSelector: React.FC<ReplyOptionsSelectorProps> = ({
  loadingReplies,
  replyOptions,
  selectedReplyOption,
  onSelect,
}) => {
  const { t } = useTranslation();
  if (!loadingReplies && (!replyOptions || replyOptions.length === 0)) {
    return null;
  }

  return (
    <div style={{ marginBottom: theme.spacing.md }}>
      <label
        style={{
          display: 'block',
          fontSize: theme.typography.fontSize.sm,
          color: theme.colors.text.secondary,
          marginBottom: theme.spacing.xs,
        }}
      >
        {t('emailDetail.suggestedReplies')}:
      </label>
      <div style={{ display: 'flex', gap: theme.spacing.xs, flexWrap: 'wrap' }}>
        {loadingReplies ? (
          <span
            style={{
              color: theme.colors.text.secondary,
              fontSize: theme.typography.fontSize.sm,
              display: 'flex',
              alignItems: 'center',
              gap: theme.spacing.xs,
              padding: theme.spacing.sm,
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: '12px',
                height: '12px',
                border: `2px solid ${theme.colors.primary.main}`,
                borderTop: '2px solid transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }}
            />
            {t('emailDetail.generating')}
          </span>
        ) : (
          replyOptions &&
          replyOptions.map(option => {
            const index = replyOptions.indexOf(option);
            const isSelected = selectedReplyOption === index;
            return (
              <button
                key={option.label || option.text.substring(0, MAX_OPTION_LENGTH)}
                onClick={() => onSelect(index, option.text)}
                title={`${option.text.substring(0, MAX_OPTION_LENGTH * 2)}...`}
                style={{
                  padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                  backgroundColor: isSelected ? theme.colors.primary.main : theme.colors.background.subtle,
                  color: isSelected ? 'white' : theme.colors.text.primary,
                  border: `1px solid ${isSelected ? theme.colors.primary.main : theme.colors.border.light}`,
                  borderRadius: theme.borderRadius.md,
                  fontSize: theme.typography.fontSize.xs,
                  fontWeight: theme.typography.fontWeight.medium,
                  cursor: 'pointer',
                  transition: theme.transitions.fast,
                  maxWidth: `${MAX_TEXTAREA_HEIGHT_PX}px`,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {option.label}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
