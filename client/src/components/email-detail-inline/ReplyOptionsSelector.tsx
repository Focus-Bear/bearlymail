import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { MAX_OPTION_LENGTH, MAX_TEXTAREA_HEIGHT_PX } from 'constants/numbers';
import { KEY_ENTER } from 'constants/strings';

interface ReplyOption {
  label: string;
  text: string;
}

interface ReplyOptionsSelectorProps {
  loadingReplies: boolean;
  replyOptions: ReplyOption[] | null;
  selectedReplyOption: number;
  onSelect: (index: number, text: string) => void;
  onGenerateFromPrompt?: (prompt: string) => void;
  generatingFromPrompt?: boolean;
}

export const ReplyOptionsSelector: React.FC<ReplyOptionsSelectorProps> = ({
  loadingReplies,
  replyOptions,
  selectedReplyOption,
  onSelect,
  onGenerateFromPrompt,
  generatingFromPrompt = false,
}) => {
  const { t } = useTranslation();
  const [customPrompt, setCustomPrompt] = useState('');

  const handleGenerate = () => {
    if (onGenerateFromPrompt && customPrompt.trim()) {
      onGenerateFromPrompt(customPrompt.trim());
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === KEY_ENTER) {
      handleGenerate();
    }
  };

  const showOptions = loadingReplies || (replyOptions && replyOptions.length > 0);

  return (
    <div style={{ marginBottom: theme.spacing.md }}>
      {showOptions && (
        <>
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
          <div style={{ display: 'flex', gap: theme.spacing.xs, flexWrap: 'wrap', marginBottom: theme.spacing.sm }}>
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
              replyOptions.map((option, index) => {
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
        </>
      )}
      {onGenerateFromPrompt && (
        <div style={{ display: 'flex', gap: theme.spacing.xs, alignItems: 'center' }}>
          <input
            type="text"
            value={customPrompt}
            onChange={event => setCustomPrompt(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('emailDetail.customReplyPromptPlaceholder')}
            disabled={generatingFromPrompt}
            style={{
              flex: 1,
              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
              border: `1px solid ${theme.colors.border.light}`,
              borderRadius: theme.borderRadius.md,
              fontSize: theme.typography.fontSize.sm,
              color: theme.colors.text.primary,
              backgroundColor: theme.colors.background.paper,
              outline: 'none',
            }}
          />
          <button
            onClick={handleGenerate}
            disabled={!customPrompt.trim() || generatingFromPrompt}
            style={{
              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
              backgroundColor: customPrompt.trim() && !generatingFromPrompt ? theme.colors.primary.main : theme.colors.background.subtle,
              color: customPrompt.trim() && !generatingFromPrompt ? 'white' : theme.colors.text.secondary,
              border: `1px solid ${customPrompt.trim() && !generatingFromPrompt ? theme.colors.primary.main : theme.colors.border.light}`,
              borderRadius: theme.borderRadius.md,
              fontSize: theme.typography.fontSize.xs,
              fontWeight: theme.typography.fontWeight.medium,
              cursor: customPrompt.trim() && !generatingFromPrompt ? 'pointer' : 'not-allowed',
              transition: theme.transitions.fast,
              whiteSpace: 'nowrap',
            }}
          >
            {generatingFromPrompt ? t('emailDetail.generatingCustomReply') : t('emailDetail.generateCustomReply')}
          </button>
        </div>
      )}
    </div>
  );
};
