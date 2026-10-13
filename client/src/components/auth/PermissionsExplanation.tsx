import React, { useEffect, useId } from 'react';
import { useTranslation } from 'react-i18next';

import {
  hasConsentScreenTips,
  OAUTH_PERMISSIONS,
  OAUTH_PROVIDER_DISPLAY_NAMES,
  type OAuthPermission,
  type OAuthProvider,
} from './oauth-permissions';
import * as styles from './PermissionsExplanation.styles';
import { PermissionsHoldButton } from './PermissionsHoldButton';

const KEY_ESCAPE = 'Escape';
const CONSENT_TIP_KEYS = ['auth.permissions.tips.keepTicked', 'auth.permissions.tips.ongoingAccess'];

interface PermissionsExplanationProps {
  onContinue: () => void;
  onCancel: () => void;
  provider: OAuthProvider;
}

/**
 * Shown before redirecting to the provider's OAuth consent screen. Explains in
 * plain language every scope the server requests (see oauth-permissions.ts)
 * and makes the user press-and-hold to continue, so the explanation is read
 * rather than clicked past. Shown once per browser (tracked by Login).
 */
export const PermissionsExplanation: React.FC<PermissionsExplanationProps> = ({ onContinue, provider, onCancel }) => {
  const { t } = useTranslation();
  const titleId = useId();
  const providerName = OAUTH_PROVIDER_DISPLAY_NAMES[provider];

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === KEY_ESCAPE) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div style={styles.overlayStyle}>
      <PermissionsExplanationResponsiveStyles />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="permissions-card"
        style={styles.cardStyle}
      >
        <p style={styles.eyebrowStyle}>{t('auth.permissions.eyebrow', { provider: providerName })}</p>
        <h2 id={titleId} className="permissions-title" style={styles.titleStyle}>
          {t('auth.permissions.title', { provider: providerName })}
        </h2>
        <p style={styles.ledeStyle}>{t('auth.permissions.intro', { provider: providerName })}</p>

        <ul style={styles.listStyle}>
          {OAUTH_PERMISSIONS[provider].map(permission => (
            <PermissionRow key={permission.id} permission={permission} />
          ))}
        </ul>

        {hasConsentScreenTips(provider) && <ConsentScreenTips providerName={providerName} />}

        <p style={styles.securityStyle}>{t('auth.permissions.security')}</p>

        <div className="permissions-actions" style={styles.actionsStyle}>
          <button type="button" onClick={onCancel} style={styles.cancelButtonStyle}>
            {t('common.cancel')}
          </button>
          <PermissionsHoldButton
            label={t('auth.permissions.holdToContinue', { provider: providerName })}
            onConfirm={onContinue}
          />
        </div>
      </div>
    </div>
  );
};

const PermissionRow: React.FC<{ permission: OAuthPermission }> = ({ permission }) => {
  const { t } = useTranslation();
  return (
    <li style={styles.rowStyle}>
      <span aria-hidden style={styles.rowIconStyle}>
        {permission.icon}
      </span>
      <div>
        <h3 style={styles.rowTitleStyle}>{t(`auth.permissions.items.${permission.id}.title`)}</h3>
        <p style={styles.rowBodyStyle}>{t(`auth.permissions.items.${permission.id}.description`)}</p>
      </div>
    </li>
  );
};

const ConsentScreenTips: React.FC<{ providerName: string }> = ({ providerName }) => {
  const { t } = useTranslation();
  return (
    <div style={styles.tipsStyle} data-testid="consent-screen-tips">
      <h3 style={styles.tipsTitleStyle}>{t('auth.permissions.tips.title', { provider: providerName })}</h3>
      <ol style={styles.tipsListStyle}>
        {CONSENT_TIP_KEYS.map(key => (
          <li key={key} style={styles.tipItemStyle}>
            {t(key)}
          </li>
        ))}
      </ol>
    </div>
  );
};

const PermissionsExplanationResponsiveStyles: React.FC = () => (
  <style>{`
    @media (max-width: 640px) {
      .permissions-card { padding: 26px 20px 22px !important; border-radius: 18px !important; }
      .permissions-title { font-size: 22px !important; }
      .permissions-actions { flex-direction: column-reverse !important; align-items: stretch !important; }
      .permissions-actions > * { width: 100%; }
    }
    .permissions-hold-button:focus-visible { outline: 3px solid ${styles.FOCUS_RING_COLOR}; outline-offset: 2px; }
  `}</style>
);
