import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { EMOJI_CHECK, EMOJI_WARNING } from 'constants/emojis';

interface ToneCheckResultProps {
  toneCheckResult: {
    isOk: boolean;
    suggestions: string[];
    revisedText?: string;
  } | null;
  onUseRevisedText: (text: string) => void;
}

export const ToneCheckResult: React.FC<ToneCheckResultProps> = ({
  toneCheckResult,
  onUseRevisedText,
}) => {
  const { t } = useTranslation();

  if (!toneCheckResult) {
    return null;
  }

  if (toneCheckResult.isOk) {
    return (
      <div style={{
        marginTop: theme.spacing.md,
        padding: theme.spacing.sm,
        backgroundColor: theme.colors.sunray.light4,
        border: `1px solid ${theme.colors.accent.success}`,
        borderRadius: theme.borderRadius.md,
        color: theme.colors.accent.success,
        fontSize: theme.typography.fontSize.sm,
        display: 'flex',
        alignItems: 'center',
        gap: theme.spacing.sm,
      }}>
        {/* eslint-disable-next-line i18next/no-literal-string */}
        <span>{EMOJI_CHECK}</span> {t('emailDetail.toneCheckPassed')}
      </div>
    );
  }

  return (
    <div style={{
      marginTop: theme.spacing.md,
      padding: theme.spacing.md,
      backgroundColor: theme.colors.sunray.light4,
      border: `1px solid ${theme.colors.accent.error}`,
      borderRadius: theme.borderRadius.md,
    }}>
      <div style={{ color: theme.colors.accent.error, fontWeight: 'bold', marginBottom: theme.spacing.xs }}>
        {/* eslint-disable-next-line i18next/no-literal-string */}
        {EMOJI_WARNING} {t('emailDetail.toneCheckIssues')}
      </div>
      <ul style={{ margin: 0, paddingLeft: theme.spacing.lg, color: theme.colors.text.primary }}>
        {toneCheckResult.suggestions.map((suggestion) => (
          <li key={suggestion}>{suggestion}</li>
        ))}
      </ul>
      {toneCheckResult.revisedText && (
        <div style={{ marginTop: theme.spacing.md }}>
          <div style={{ fontWeight: 'bold', fontSize: theme.typography.fontSize.sm }}>{t('emailDetail.suggestedRevision')}</div>
          <div style={{ 
            padding: theme.spacing.sm, 
            backgroundColor: theme.colors.background.default,
            borderRadius: theme.borderRadius.sm,
            marginTop: theme.spacing.xs,
            whiteSpace: 'pre-wrap',
            fontSize: theme.typography.fontSize.sm,
          }}>
            {toneCheckResult.revisedText}
          </div>
          <button
            onClick={() => onUseRevisedText(toneCheckResult.revisedText!)}
            style={{
              marginTop: theme.spacing.sm,
              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
              backgroundColor: theme.colors.primary.main,
              color: 'white',
              border: 'none',
              borderRadius: theme.borderRadius.sm,
              cursor: 'pointer',
              fontSize: theme.typography.fontSize.sm,
            }}
          >
            {t('emailDetail.useRevisedText')}
          </button>
        </div>
      )}
    </div>
  );
};



