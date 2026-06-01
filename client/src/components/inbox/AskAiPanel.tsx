/**
 * AskAiPanel — UI shell for the "Ask AI" tab in the email action sidebar.
 *
 * This is a mock surface: the input is disabled and suggested prompts are
 * non-functional. Backend wiring (streaming chat against the open email's
 * context) is tracked in Focus-Bear/BearlyMail#2315.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { FiSend, FiZap } from 'react-icons/fi';
import { theme } from 'theme/theme';

import { COLOR_TRANSPARENT } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';

const SUGGESTED_PROMPT_KEYS = ['inbox.askAi.prompt1', 'inbox.askAi.prompt2', 'inbox.askAi.prompt3'] as const;

const AskAiHeader: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm, color: theme.colors.text.primary }}>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '28px',
          height: '28px',
          borderRadius: theme.borderRadius.full,
          backgroundColor: theme.colors.primary.subtle,
          color: theme.colors.primary.main,
          flexShrink: 0,
        }}
      >
        <FiZap size={15} />
      </span>
      <span style={{ fontSize: theme.typography.fontSize.lg, fontWeight: theme.typography.fontWeight.semibold }}>
        {t('inbox.askAi.title')}
      </span>
      <span
        style={{
          marginLeft: 'auto',
          fontSize: theme.typography.fontSize.xs,
          fontWeight: theme.typography.fontWeight.semibold,
          color: theme.colors.primary.main,
          backgroundColor: theme.colors.primary.subtle,
          padding: `2px ${theme.spacing.sm}`,
          borderRadius: theme.borderRadius.full,
        }}
      >
        {t('inbox.askAi.comingSoon')}
      </span>
    </div>
  );
};

const AskAiSuggestions: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.sm }}>
      <span
        style={{
          fontSize: theme.typography.fontSize.xs,
          fontWeight: theme.typography.fontWeight.semibold,
          color: theme.colors.text.tertiary,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {t('inbox.askAi.suggestedHeading')}
      </span>
      {SUGGESTED_PROMPT_KEYS.map(key => (
        <button
          key={key}
          type="button"
          disabled
          style={{
            textAlign: 'left',
            padding: `${theme.spacing.sm} ${theme.spacing.md}`,
            backgroundColor: theme.colors.background.subtle,
            color: theme.colors.text.secondary,
            border: `1px solid ${theme.colors.border.light}`,
            borderRadius: theme.borderRadius.md,
            fontSize: theme.typography.fontSize.sm,
            cursor: 'not-allowed',
          }}
        >
          {t(key)}
        </button>
      ))}
    </div>
  );
};

const AskAiInput: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xs }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: theme.spacing.sm,
          padding: theme.spacing.sm,
          borderRadius: theme.borderRadius.md,
          border: `1px solid ${theme.colors.border.light}`,
          backgroundColor: theme.colors.background.subtle,
        }}
      >
        <input
          type="text"
          disabled
          placeholder={t('inbox.askAi.inputPlaceholder')}
          aria-label={t('inbox.askAi.inputPlaceholder')}
          style={{
            flex: 1,
            minWidth: 0,
            border: STRING_NONE,
            backgroundColor: COLOR_TRANSPARENT,
            fontSize: theme.typography.fontSize.sm,
            color: theme.colors.text.secondary,
            outline: STRING_NONE,
          }}
        />
        <button
          type="button"
          disabled
          aria-label={t('inbox.askAi.send')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '32px',
            height: '32px',
            borderRadius: theme.borderRadius.md,
            border: STRING_NONE,
            backgroundColor: theme.colors.primary.subtle,
            color: theme.colors.primary.main,
            cursor: 'not-allowed',
            flexShrink: 0,
          }}
        >
          <FiSend size={15} />
        </button>
      </div>
      <span style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.text.tertiary, textAlign: 'center' }}>
        {t('inbox.askAi.disclaimer')}
      </span>
    </div>
  );
};

export const AskAiPanel: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: theme.spacing.md }}>
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
        <AskAiHeader />
        <p
          style={{
            margin: 0,
            fontSize: theme.typography.fontSize.md,
            color: theme.colors.text.tertiary,
            lineHeight: theme.typography.lineHeight.normal,
          }}
        >
          {t('inbox.askAi.subtitle')}
        </p>
        <AskAiSuggestions />
      </div>
      <AskAiInput />
    </div>
  );
};
