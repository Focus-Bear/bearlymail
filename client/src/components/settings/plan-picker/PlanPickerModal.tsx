import React from 'react';
import { useTranslation } from 'react-i18next';
import { VolumeUsage } from 'queries/useOrgUsage';
import { PlanTier, usePlanTiers } from 'queries/usePlanTiers';
import { theme } from 'theme/theme';

import { UPGRADE_MAILTO_HREF } from 'components/settings/plan-picker/planPicker.constants';
import { PlanTierCard } from 'components/settings/plan-picker/PlanTierCard';
import {
  PHASE_ACTIVATING,
  PHASE_PURCHASING,
  PHASE_SUCCESS,
  PHASE_TIMEOUT,
  PurchasePhase,
  usePlanPurchase,
} from 'components/settings/plan-picker/usePlanPurchase';
import { getRevenueCatApiKey } from 'config/revenuecat';
import { OPACITY_HALF, Z_INDEX_MODAL_OVERLAY } from 'constants/numbers';

const PLAN_STATUS_ACTIVE = 'active';
const DISABLED_OPACITY = 0.6;

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: `rgba(0, 0, 0, ${OPACITY_HALF})`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: Z_INDEX_MODAL_OVERLAY,
  padding: '24px',
};

const panelStyle: React.CSSProperties = {
  backgroundColor: theme.colors.background.paper,
  borderRadius: '12px',
  padding: '24px',
  maxWidth: '640px',
  width: '100%',
  boxShadow: theme.shadows.xl,
  maxHeight: '90vh',
  overflowY: 'auto',
};

const titleRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: '16px',
};

const titleStyle: React.CSSProperties = {
  fontSize: '18px',
  fontWeight: 600,
  color: theme.colors.text.primary,
  margin: 0,
};

const closeButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: '20px',
  cursor: 'pointer',
  color: theme.colors.text.secondary,
  lineHeight: 1,
};

const cardsRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '12px',
  flexWrap: 'wrap',
  alignItems: 'stretch',
};

const noteStyle: React.CSSProperties = {
  fontSize: '13px',
  color: theme.colors.text.secondary,
  marginTop: '16px',
  marginBottom: 0,
};

const actionButtonStyle: React.CSSProperties = {
  backgroundColor: theme.colors.primary.main,
  color: theme.colors.common.white,
  border: 'none',
  borderRadius: '6px',
  padding: '8px 12px',
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
};

const mailtoLinkStyle: React.CSSProperties = {
  ...actionButtonStyle,
  display: 'inline-block',
  textAlign: 'center',
  textDecoration: 'none',
};

const statusTextStyle: React.CSSProperties = {
  fontSize: '15px',
  color: theme.colors.text.primary,
  margin: '24px 0',
  textAlign: 'center',
};

/** Full-body status shown instead of the tier cards after checkout completes. */
const PurchaseStatus: React.FC<{ phase: PurchasePhase }> = ({ phase }) => {
  const { t } = useTranslation();
  const messageKeys: Partial<Record<PurchasePhase, string>> = {
    activating: 'team.settings.planPicker.activating',
    success: 'team.settings.planPicker.activated',
    timeout: 'team.settings.planPicker.activationDelayed',
  };
  const key = messageKeys[phase];
  if (!key) {
    return null;
  }
  return (
    <p style={statusTextStyle} data-testid={`plan-purchase-status-${phase}`}>
      {t(key)}
    </p>
  );
};

interface PlanPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  volumeUsage?: VolumeUsage;
  /** True when the current user may buy in-app (org owner or admin). */
  canPurchase: boolean;
  /** True for org members without billing rights — tiers render read-only with a hint. */
  showMemberNote: boolean;
}

/**
 * Modal listing the purchasable volume tiers. Owners/admins with a configured
 * RevenueCat Web Billing key get an in-app checkout; without a key (or without
 * an org to bill) the action falls back to a contact-us mailto; plain members
 * see the tiers read-only with an "ask your org owner" note.
 */
export const PlanPickerModal: React.FC<PlanPickerModalProps> = ({
  isOpen,
  onClose,
  volumeUsage,
  canPurchase,
  showMemberNote,
}) => {
  const { t } = useTranslation();
  const { data: tiers, isLoading, isError } = usePlanTiers(isOpen);
  const { phase, purchasingTierId, startPurchase } = usePlanPurchase();

  if (!isOpen) {
    return null;
  }

  const inAppCheckout = canPurchase && getRevenueCatApiKey() !== null;
  const currentTierId = volumeUsage?.planStatus === PLAN_STATUS_ACTIVE ? volumeUsage.tier : undefined;
  const showStatusOnly = phase === PHASE_ACTIVATING || phase === PHASE_SUCCESS || phase === PHASE_TIMEOUT;

  const renderAction = (tier: PlanTier): React.ReactNode => {
    if (showMemberNote) {
      return null;
    }
    if (!inAppCheckout) {
      return (
        <a href={UPGRADE_MAILTO_HREF} style={mailtoLinkStyle}>
          {t('team.settings.planPicker.contactUs')}
        </a>
      );
    }
    if (tier.id === currentTierId) {
      return (
        <button style={{ ...actionButtonStyle, opacity: DISABLED_OPACITY, cursor: 'default' }} disabled>
          {t('team.settings.planPicker.currentPlan')}
        </button>
      );
    }
    const isBusy = phase === PHASE_PURCHASING;
    return (
      <button
        style={{ ...actionButtonStyle, opacity: isBusy ? DISABLED_OPACITY : 1 }}
        disabled={isBusy}
        onClick={() => startPurchase(tier.id)}
        data-testid={`plan-choose-${tier.id}`}
      >
        {isBusy && purchasingTierId === tier.id
          ? t('team.settings.planPicker.openingCheckout')
          : t('team.settings.planPicker.choosePlan')}
      </button>
    );
  };

  return (
    <div style={overlayStyle} onClick={onClose} data-testid="plan-picker-modal">
      <div style={panelStyle} onClick={event => event.stopPropagation()}>
        <div style={titleRowStyle}>
          <h3 style={titleStyle}>{t('team.settings.planPicker.title')}</h3>
          <button style={closeButtonStyle} onClick={onClose} aria-label={t('common.close')}>
            ×
          </button>
        </div>

        {showStatusOnly ? (
          <PurchaseStatus phase={phase} />
        ) : (
          <>
            {isLoading && <p style={noteStyle}>{t('common.loading')}</p>}
            {isError && <p style={noteStyle}>{t('team.settings.planPicker.loadError')}</p>}
            {tiers && (
              <div style={cardsRowStyle}>
                {tiers.map(tier => (
                  <PlanTierCard key={tier.id} tier={tier} isCurrent={tier.id === currentTierId} action={renderAction(tier)} />
                ))}
              </div>
            )}
            {showMemberNote && <p style={noteStyle}>{t('team.settings.planPicker.memberNote')}</p>}
            {!showMemberNote && !inAppCheckout && <p style={noteStyle}>{t('team.settings.planPicker.contactNote')}</p>}
          </>
        )}
      </div>
    </div>
  );
};
