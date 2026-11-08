import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

const LOGO_SRC = '/favicon.svg';
const LOGO_SIZE_PX = 40;
const CARD_MAX_WIDTH_PX = 480;

/** Centred card on the brand background, shared by every consent-page state. */
export const ConsentPageShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useTranslation();
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: `${theme.spacing.xl} ${theme.spacing.md}`,
        backgroundColor: theme.colors.background.default,
        boxSizing: 'border-box',
      }}
    >
      <div
        data-testid="oauth-consent-card"
        style={{
          width: '100%',
          maxWidth: CARD_MAX_WIDTH_PX,
          padding: theme.spacing.xl,
          backgroundColor: theme.colors.background.paper,
          borderRadius: theme.borderRadius.lg,
          boxShadow: theme.shadows.md,
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm, marginBottom: theme.spacing.lg }}>
          <img src={LOGO_SRC} alt="" width={LOGO_SIZE_PX} height={LOGO_SIZE_PX} />
          <span
            style={{
              fontSize: theme.typography.fontSize.lg,
              fontWeight: theme.typography.fontWeight.semibold,
              color: theme.colors.text.primary,
            }}
          >
            {t('oauthConsent.brand')}
          </span>
        </div>
        {children}
      </div>
    </main>
  );
};
