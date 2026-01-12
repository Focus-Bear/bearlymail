import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { OPACITY_DISABLED_ALT, Z_INDEX_MODAL_OVERLAY } from 'constants/numbers';

interface ProviderSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectProvider: (provider: 'gmail' | 'office365' | 'zoho') => void;
}

export const ProviderSelectionModal: React.FC<ProviderSelectionModalProps> = ({
  isOpen,
  onClose,
  onSelectProvider,
}) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  const providers = [
    {
      id: 'gmail' as const,
      name: 'Gmail',
      description: t('settings.emailAccounts.providers.gmail.description'),
      color: '#EA4335',
    },
    {
      id: 'office365' as const,
      name: 'Office 365',
      description: t('settings.emailAccounts.providers.office365.description'),
      color: '#0078D4',
    },
    {
      id: 'zoho' as const,
      name: 'Zoho Mail',
      description: t('settings.emailAccounts.providers.zoho.description'),
      color: '#C8202F',
    },
  ];

  const handleProviderClick = (providerId: 'gmail' | 'office365' | 'zoho') => {
    onSelectProvider(providerId);
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
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
        onClick={(e) => e.stopPropagation()}
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
          {providers.map((provider) => (
            <button
              key={provider.id}
              onClick={() => handleProviderClick(provider.id)}
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
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = provider.color;
                e.currentTarget.style.backgroundColor = theme.colors.background.paper;
                e.currentTarget.style.boxShadow = theme.shadows.md;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = theme.colors.border.medium;
                e.currentTarget.style.backgroundColor = theme.colors.background.default;
                e.currentTarget.style.boxShadow = 'none';
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
                  color: 'white',
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
                <div
                  style={{
                    color: theme.colors.text.secondary,
                    fontSize: theme.typography.fontSize.sm,
                  }}
                >
                  {provider.description}
                </div>
              </div>
            </button>
          ))}
        </div>

        <button
          onClick={onClose}
          style={{
            marginTop: theme.spacing.xl,
            padding: `${theme.spacing.sm} ${theme.spacing.md}`,
            backgroundColor: 'transparent',
            color: theme.colors.text.secondary,
            border: `1px solid ${theme.colors.border.medium}`,
            borderRadius: theme.borderRadius.md,
            fontSize: theme.typography.fontSize.sm,
            cursor: 'pointer',
            width: '100%',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = theme.colors.background.default;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
};



