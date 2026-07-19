import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { theme } from 'theme/theme';
import { registerAiLimitNotifier } from 'utils/axios-interceptors';

import { AI_LIMIT_BANNER_RESHOW_MS, Z_INDEX_POPUP } from 'constants/numbers';
import { SETTINGS_PLANS_ROUTE } from 'constants/strings';

const bannerStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  zIndex: Z_INDEX_POPUP,
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '10px 16px',
  backgroundColor: theme.colors.warning.light,
  borderBottom: `1px solid ${theme.colors.warning.main}`,
  color: theme.colors.text.primary,
  fontSize: '14px',
  boxShadow: '0 2px 6px rgba(0, 0, 0, 0.08)',
};

const messageStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  margin: 0,
};

const viewPlansButtonStyle: React.CSSProperties = {
  backgroundColor: theme.colors.primary.main,
  color: theme.colors.common.white,
  border: 'none',
  borderRadius: '6px',
  padding: '6px 14px',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const dismissButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: '18px',
  lineHeight: 1,
  padding: '4px',
  color: theme.colors.text.secondary,
};

const WARNING_ICON = '⚠️';

interface AiLimitBannerViewProps {
  onViewPlans: () => void;
  onDismiss: () => void;
}

/**
 * Presentational part of the AI-limit banner: warning icon, translated
 * message, a primary "View plans" CTA, and an X dismiss button. Fixed to the
 * top of the viewport so it survives route changes until dismissed.
 */
export const AiLimitBannerView: React.FC<AiLimitBannerViewProps> = ({ onViewPlans, onDismiss }) => {
  const { t } = useTranslation();

  return (
    <div role="alert" data-testid="ai-limit-banner" style={bannerStyle}>
      <span aria-hidden="true">{WARNING_ICON}</span>
      <p style={messageStyle}>{t('team.settings.aiLimitReached')}</p>
      <button style={viewPlansButtonStyle} onClick={onViewPlans} data-testid="ai-limit-banner-view-plans">
        {t('team.settings.planPicker.viewPlans')}
      </button>
      <button
        style={dismissButtonStyle}
        onClick={onDismiss}
        aria-label={t('common.dismiss')}
        data-testid="ai-limit-banner-dismiss"
      >
        ×
      </button>
    </div>
  );
};

/**
 * Persistent, dismissible app-level banner shown when the API rejects a
 * request with the AI-capacity 402 (AI_VOLUME_LIMIT_REACHED). Bridges the
 * axios response interceptor (a non-React module) to the UI via
 * registerAiLimitNotifier. Behaviour:
 * - appears on the first 402 and stays until dismissed (no auto-timeout);
 * - repeat 402s while visible do nothing;
 * - after a dismissal the next 402 re-shows it, but never more than once per
 *   AI_LIMIT_BANNER_RESHOW_MS (measured from when it last appeared);
 * - "View plans" deep-links to Settings > Team & Plan and auto-opens the
 *   plan picker modal (TeamSettingsSection handles the ?plans=open param).
 * Renders nothing until tripped; mount it once inside the Router.
 */
export const AiLimitBanner: React.FC = () => {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const visibleRef = useRef(false);
  const lastShownAtRef = useRef(0);

  useEffect(() => {
    registerAiLimitNotifier(() => {
      const now = Date.now();
      if (visibleRef.current || now - lastShownAtRef.current < AI_LIMIT_BANNER_RESHOW_MS) {
        return;
      }
      lastShownAtRef.current = now;
      visibleRef.current = true;
      setVisible(true);
    });
    return () => registerAiLimitNotifier(null);
  }, []);

  const hide = () => {
    visibleRef.current = false;
    setVisible(false);
  };

  const handleViewPlans = () => {
    hide();
    navigate(SETTINGS_PLANS_ROUTE);
  };

  if (!visible) {
    return null;
  }

  return <AiLimitBannerView onViewPlans={handleViewPlans} onDismiss={hide} />;
};
