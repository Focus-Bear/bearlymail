import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { COLOR_NAMED_WHITE, COLOR_TRANSPARENT } from 'constants/colors';
import { OPACITY_DISABLED_ALT, Z_INDEX_MODAL_OVERLAY } from 'constants/numbers';
import { KEY_ESCAPE } from 'constants/strings';

import { getProviderOptions, type ProviderOption } from './providerSelectionModal.helpers';

export type { ProviderOption } from './providerSelectionModal.helpers';

interface ProviderSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectProvider: (provider: 'gmail' | 'office365' | 'zoho' | 'apple-mail') => void;
  appleMailAvailable?: boolean;
}

interface ProviderOptionCardProps {
  provider: ProviderOption;
  onSelect: (id: 'gmail' | 'office365' | 'zoho' | 'apple-mail') => void;
}

const ProviderOptionCard: React.FC<ProviderOptionCardProps> = ({ provider, onSelect }) => (
  <button
    key={provider.id}
    onClick={() => onSelect(provider.id)}
    style={{
      padding: theme.spacing.lg,
      border: `2px solid ${theme.colors.border.medium}`,
      borderRadius: theme.borderRadius.md,
      backgroundColor: theme.colors.background.default,
      cursor: 'pointer',
      textAlign: 'left',
      transition: 'all 0.2s ease',
      display: 'flex',
      alignItems: 'center',
      gap: theme.spacing.md,
    }}
    onMouseEnter={event => {
      event.currentTarget.style.borderColor = provider.color;
      event.currentTarget.style.backgroundColor = theme.colors.background.paper;
      event.currentTarget.style.boxShadow = theme.shadows.md;
    }}
    onMouseLeave={event => {
      event.currentTarget.style.borderColor = theme.colors.border.medium;
      event.currentTarget.style.backgroundColor = theme.colors.background.default;
      event.currentTarget.style.boxShadow = 'none';
    }}
  >
    <div
      style={{
        width: '48px',
        height: '48px',
        borderRadius: theme.borderRadius.md,
        backgroundColor: provider.color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: COLOR_NAMED_WHITE,
        fontSize: theme.typography.fontSize.lg,
        fontWeight: theme.typography.fontWeight.bold,
        flexShrink: 0,
      }}
    >
      {provider.name.charAt(0)}
    </div>
    <div style={{ flex: 1 }}>
      <div
        style={{
          color: theme.colors.text.primary,
          fontSize: theme.typography.fontSize.lg,
          fontWeight: theme.typography.fontWeight.medium,
          marginBottom: theme.spacing.xs,
        }}
      >
        {provider.name}
      </div>
      <div style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.sm }}>
        {provider.description}
      </div>
    </div>
  </button>
);

export const ProviderSelectionModal: React.FC<ProviderSelectionModalProps> = ({
  isOpen,
  onClose,
  onSelectProvider,
  appleMailAvailable = false,
}) => {
  const { t } = useTranslation();

  if (!isOpen) {
    return null;
  }

  const providers = getProviderOptions(t, appleMailAvailable);

  const handleProviderClick = (providerId: 'gmail' | 'office365' | 'zoho' | 'apple-mail') => {
    onSelectProvider(providerId);
    onClose();
  };
  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === KEY_ESCAPE) {
      onClose();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: `rgba(0, 0, 0, ${OPACITY_DISABLED_ALT})`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: Z_INDEX_MODAL_OVERLAY,
        padding: theme.spacing.lg,
      }}
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="provider-modal-title"
    >
      <div
        style={{
          backgroundColor: theme.colors.background.paper,
          borderRadius: theme.borderRadius.lg,
          padding: theme.spacing['2xl'],
          maxWidth: '600px',
          width: '100%',
          boxShadow: theme.shadows.xl,
        }}
        onClick={event => event.stopPropagation()}
      >
        <h2
          id="provider-modal-title"
          style={{
            color: theme.colors.text.primary,
            marginBottom: theme.spacing.xl,
            fontSize: theme.typography.fontSize['2xl'],
            fontWeight: theme.typography.fontWeight.semibold,
          }}
        >
          {t('settings.emailAccounts.selectProvider')}
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
          {providers.map(provider => (
            <ProviderOptionCard key={provider.id} provider={provider} onSelect={handleProviderClick} />
          ))}
        </div>

        <button
          onClick={onClose}
          style={{
            marginTop: theme.spacing.xl,
            padding: `${theme.spacing.sm} ${theme.spacing.md}`,
            backgroundColor: COLOR_TRANSPARENT,
            color: theme.colors.text.secondary,
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.md,
            fontSize: theme.typography.fontSize.sm,
            cursor: 'pointer',
            width: '100%',
          }}
          onMouseEnter={event => {
            event.currentTarget.style.backgroundColor = theme.colors.background.default;
          }}
          onMouseLeave={event => {
            event.currentTarget.style.backgroundColor = COLOR_TRANSPARENT;
          }}
        >
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
};
