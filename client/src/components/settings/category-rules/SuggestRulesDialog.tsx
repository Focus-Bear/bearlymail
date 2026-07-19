import React from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import type { CategoryRuleSuggestion } from 'types/category-rules.types';

import { ModalBackdrop, ModalContent } from 'components/modal';
import { ModalHeaderWithClose } from 'components/modal/ModalHeaderWithClose';
import { COLOR_WHITE } from 'constants/colors';

interface SuggestRulesDialogProps {
  open: boolean;
  loading: boolean;
  suggestions: CategoryRuleSuggestion[];
  error: string | null;
  onClose: () => void;
  onAccept: (suggestion: CategoryRuleSuggestion) => void;
}

export const SuggestRulesDialog: React.FC<SuggestRulesDialogProps> = ({
  open,
  loading,
  suggestions,
  error,
  onClose,
  onAccept,
}) => {
  const { t } = useTranslation();

  if (!open) {
    return null;
  }

  return createPortal(
    <ModalBackdrop onClose={onClose} zIndex={10002}>
      <ModalContent>
        <ModalHeaderWithClose
          title={t('settings.deterministicCategoryRules.suggestDialogTitle')}
          onClose={onClose}
        />

        {loading && (
          <p
            style={{
              color: theme.colors.text.secondary,
              fontSize: theme.typography.fontSize.sm,
              margin: 0,
            }}
          >
            {t('settings.deterministicCategoryRules.suggestLoading')}
          </p>
        )}

        {!loading && error && (
          <p
            style={{
              color: theme.colors.error.main,
              fontSize: theme.typography.fontSize.sm,
              margin: 0,
            }}
          >
            {error}
          </p>
        )}

        {!loading && !error && suggestions.length === 0 && (
          <p
            style={{
              color: theme.colors.text.secondary,
              fontSize: theme.typography.fontSize.sm,
              margin: 0,
            }}
          >
            {t('settings.deterministicCategoryRules.suggestEmpty')}
          </p>
        )}

        {!loading && !error && suggestions.length > 0 && (
          <div>
            <p
              style={{
                margin: `0 0 ${theme.spacing.md} 0`,
                fontSize: theme.typography.fontSize.sm,
                color: theme.colors.text.secondary,
              }}
            >
              {t('settings.deterministicCategoryRules.suggestIntro')}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
              {suggestions.map((suggestion) => (
                <SuggestionCard
                  key={suggestion.sender}
                  suggestion={suggestion}
                  onAccept={onAccept}
                />
              ))}
            </div>
          </div>
        )}
      </ModalContent>
    </ModalBackdrop>,
    document.body,
  );
};

interface SuggestionCardProps {
  suggestion: CategoryRuleSuggestion;
  onAccept: (suggestion: CategoryRuleSuggestion) => void;
}

const SuggestionCard: React.FC<SuggestionCardProps> = ({ suggestion, onAccept }) => {
  const { t } = useTranslation();

  const chipStyle: React.CSSProperties = {
    display: 'inline-block',
    padding: '1px 6px',
    borderRadius: '3px',
    background: theme.colors.border.light,
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.text.secondary,
    marginRight: '4px',
    marginBottom: '4px',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.text.tertiary,
    fontWeight: 600,
    marginBottom: '4px',
    display: 'block',
  };

  return (
    <div
      style={{
        border: `1px solid ${theme.colors.border.medium}`,
        borderRadius: theme.borderRadius.sm,
        padding: theme.spacing.sm,
      }}
    >
      {/* Sender */}
      <div style={{ marginBottom: theme.spacing.xs }}>
        <span style={labelStyle}>{t('settings.deterministicCategoryRules.suggestSenderLabel')}</span>
        <code style={{ fontSize: theme.typography.fontSize.xs }}>{suggestion.sender}</code>
        <span
          style={{
            marginLeft: theme.spacing.xs,
            fontSize: theme.typography.fontSize.xs,
            color: theme.colors.text.tertiary,
          }}
        >
          {t('settings.deterministicCategoryRules.suggestThreadCount', {
            count: suggestion.threadCount,
          })}
        </span>
      </div>

      {/* Subject phrases */}
      <div style={{ marginBottom: theme.spacing.xs }}>
        <span style={labelStyle}>{t('settings.deterministicCategoryRules.suggestSubjectLabel')}</span>
        <div>
          {suggestion.suggestedSubjectPhrases.map((phrase) => (
            <span key={phrase} style={chipStyle}>{phrase}</span>
          ))}
        </div>
      </div>

      {/* Body phrases */}
      <div style={{ marginBottom: theme.spacing.sm }}>
        <span style={labelStyle}>{t('settings.deterministicCategoryRules.suggestBodyLabel')}</span>
        <div>
          {suggestion.suggestedBodyPhrases.map((phrase) => (
            <span key={phrase} style={chipStyle}>{phrase}</span>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: theme.spacing.xs, justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={() => onAccept(suggestion)}
          style={{
            padding: `${theme.spacing.xs} ${theme.spacing.md}`,
            borderRadius: theme.borderRadius.sm,
            border: 'none',
            background: theme.colors.primary.main,
            color: COLOR_WHITE,
            cursor: 'pointer',
            fontSize: theme.typography.fontSize.sm,
          }}
        >
          {t('settings.deterministicCategoryRules.suggestReviewButton')}
        </button>
      </div>
    </div>
  );
};