import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { ACCESS_LEVELS, AccessLevel } from 'constants/claudeAccess';

/** Nudges the radio down to line up with the option title. */
const RADIO_TOP_OFFSET_PX = 3;
const DISABLED_OPACITY = 0.6;

interface ConsentScopeChoiceProps {
  accessLevel: AccessLevel;
  canRequestDrafts: boolean;
  canRequestSend: boolean;
  onChange: (accessLevel: AccessLevel) => void;
}

interface ScopeOptionProps {
  value: AccessLevel;
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

/**
 * Read-only (the default), read + drafts, or read + drafts + send. Each is
 * offered only if the client asked for it (asking to send covers drafting).
 */
export const ConsentScopeChoice: React.FC<ConsentScopeChoiceProps> = ({
  accessLevel,
  canRequestDrafts,
  canRequestSend,
  onChange,
}) => {
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
          value={ACCESS_LEVELS.READ}
          isChecked={accessLevel === ACCESS_LEVELS.READ}
          title={t('oauthConsent.scopeReadTitle')}
          description={t('oauthConsent.scopeReadDescription')}
          onSelect={() => onChange(ACCESS_LEVELS.READ)}
        />
        <ScopeOption
          value={ACCESS_LEVELS.DRAFT}
          isChecked={accessLevel === ACCESS_LEVELS.DRAFT}
          isDisabled={!canRequestDrafts}
          title={t('oauthConsent.scopeDraftTitle')}
          description={
            canRequestDrafts ? t('oauthConsent.scopeDraftDescription') : t('oauthConsent.scopeDraftNotRequested')
          }
          onSelect={() => onChange(ACCESS_LEVELS.DRAFT)}
        />
        <ScopeOption
          value={ACCESS_LEVELS.SEND}
          isChecked={accessLevel === ACCESS_LEVELS.SEND}
          isDisabled={!canRequestSend}
          title={t('oauthConsent.scopeSendTitle')}
          description={
            canRequestSend ? t('oauthConsent.scopeSendDescription') : t('oauthConsent.scopeSendNotRequested')
          }
          onSelect={() => onChange(ACCESS_LEVELS.SEND)}
        />
      </div>
    </fieldset>
  );
};
