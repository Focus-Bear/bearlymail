import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { FiSettings } from 'react-icons/fi';
import { theme } from 'theme/theme';

import { COLOR_NAMED_WHITE } from 'constants/colors';
import { CardType } from 'hooks/useCardVisibilityPreferences';

interface CardOption {
  type: CardType;
  labelKey: string;
}

const CARD_OPTIONS: CardOption[] = [
  { type: 'summary', labelKey: 'emailDetail.aiSummary' },
  { type: 'actionItems', labelKey: 'emailDetail.actionItems' },
  { type: 'github', labelKey: 'emailDetail.cardLabels.github' },
  { type: 'crm', labelKey: 'emailDetail.cardLabels.crm' },
  { type: 'senderContext', labelKey: 'emailDetail.cardLabels.senderContext' },
  { type: 'privateNotes', labelKey: 'emailDetail.privateNotes' },
];

interface CardDisplaySettingsProps {
  hiddenCards: Set<CardType>;
  onShowCard: (card: CardType) => void;
  onHideCard: (card: CardType) => void;
  isOpen: boolean;
  onClose: () => void;
}

export const CardDisplaySettingsButton: React.FC<{ onClick: () => void }> = ({ onClick }) => {
  const { t } = useTranslation();
  return (
    <button
      onClick={onClick}
      title={t('emailDetail.displaySettings')}
      style={{
        background: 'transparent',
        border: `1px solid ${theme.colors.border.medium}`,
        borderRadius: theme.borderRadius.md,
        cursor: 'pointer',
        color: theme.colors.text.secondary,
        display: 'flex',
        alignItems: 'center',
        padding: theme.spacing.xs,
      }}
    >
      <FiSettings size={16} />
    </button>
  );
};

export const CardDisplaySettings: React.FC<CardDisplaySettingsProps> = ({
  hiddenCards,
  onShowCard,
  onHideCard,
  isOpen,
  onClose,
}) => {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      ref={panelRef}
      style={{
        position: 'absolute',
        top: '100%',
        right: 0,
        marginTop: theme.spacing.xs,
        backgroundColor: COLOR_NAMED_WHITE,
        border: `1px solid ${theme.colors.border.medium}`,
        borderRadius: theme.borderRadius.lg,
        boxShadow: theme.shadows.lg,
        padding: theme.spacing.md,
        zIndex: 100,
        minWidth: '220px',
      }}
    >
      <div
        style={{
          fontSize: theme.typography.fontSize.sm,
          fontWeight: theme.typography.fontWeight.semibold,
          color: theme.colors.text.primary,
          marginBottom: theme.spacing.sm,
        }}
      >
        {t('emailDetail.displaySettings')}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.xs }}>
        {CARD_OPTIONS.map(({ type, labelKey }) => {
          const isHidden = hiddenCards.has(type);
          return (
            <label
              key={type}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: theme.spacing.sm,
                cursor: 'pointer',
                fontSize: theme.typography.fontSize.sm,
                color: theme.colors.text.primary,
                padding: `${theme.spacing.xs} 0`,
              }}
            >
              <input
                type="checkbox"
                checked={!isHidden}
                onChange={() => (isHidden ? onShowCard(type) : onHideCard(type))}
                style={{ cursor: 'pointer' }}
              />
              {t(labelKey)}
            </label>
          );
        })}
      </div>
    </div>
  );
};
