import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

/** Nudges the radio down to line up with the option title. */
const RADIO_TOP_OFFSET_PX = 3;
const DISABLED_OPACITY = 0.6;

interface ConsentScopeChoiceProps {
  allowSend: boolean;
  canRequestSend: boolean;
  onChange: (allowSend: boolean) => void;
}

interface ScopeOptionProps {
  value: 'read' | 'send';
  isChecked: boolean;
  isDisabled?: boolean;
  title: string;
  description: string;
  onSelect: () => void;
}

const ScopeOption: React.FC<ScopeOptionProps> = ({ value, isChecked, isDisabled, title, description, onSelect }) => (
  <label
    style={{
      display: 'flex',
      gap: theme.spacing.sm,
      padding: theme.spacing.sm,
      border: `1px solid ${isChecked ? theme.colors.primary.main : theme.colors.border.light}`,
      borderRadius: theme.borderRadius.md,
      backgroundColor: isChecked ? theme.colors.primary.subtle : theme.colors.background.paper,
      cursor: isDisabled ? 'not-allowed' : 'pointer',
      opacity: isDisabled ? DISABLED_OPACITY : 1,
    }}
  >
    <input
      type="radio"
      name="oauth-consent-scope"
      value={value}
      checked={isChecked}
      disabled={isDisabled}
      onChange={onSelect}
      data-testid={`oauth-consent-scope-${value}`}
      style={{ marginTop: RADIO_TOP_OFFSET_PX }}
    />
    <span>
      <span style={{ display: 'block', fontSize: theme.typography.fontSize.sm, fontWeight: theme.typography.fontWeight.semibold }}>
        {title}
      </span>
      <span style={{ display: 'block', fontSize: theme.typography.fontSize.xs, color: theme.colors.text.secondary }}>
        {description}
      </span>
    </span>
  </label>
);

/** Read-only (the default) or read + send. Send is offered only if the client asked for it. */
export const ConsentScopeChoice: React.FC<ConsentScopeChoiceProps> = ({ allowSend, canRequestSend, onChange }) => {
  const { t } = useTranslation();
  return (
    <fieldset style={{ border: 'none', margin: `0 0 ${theme.spacing.lg}`, padding: 0 }}>
      <legend
        style={{
          marginBottom: theme.spacing.sm,
          fontSize: theme.typography.fontSize.sm,
          fontWeight: theme.typography.fontWeight.semibold,
          color: theme.colors.text.primary,
        }}
      >
        {t('oauthConsent.scopeLegend')}
      </legend>
      <div style={{ display: 'grid', gap: theme.spacing.sm }}>
        <ScopeOption
          value="read"
          isChecked={!allowSend}
          title={t('oauthConsent.scopeReadTitle')}
          description={t('oauthConsent.scopeReadDescription')}
          onSelect={() => onChange(false)}
        />
        <ScopeOption
          value="send"
          isChecked={allowSend}
          isDisabled={!canRequestSend}
          title={t('oauthConsent.scopeSendTitle')}
          description={
            canRequestSend ? t('oauthConsent.scopeSendDescription') : t('oauthConsent.scopeSendNotRequested')
          }
          onSelect={() => onChange(true)}
        />
      </div>
    </fieldset>
  );
};
