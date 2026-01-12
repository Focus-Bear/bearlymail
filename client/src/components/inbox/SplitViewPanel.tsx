import React, { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import EmailDetail from 'pages/EmailDetail';
import { EMOJI_CLOSE, EMOJI_EXPAND } from 'constants/emojis';

interface SplitViewPanelProps {
  selectedEmailId: string;
  panelExpanded: boolean;
  splitPosition: number;
  isResizing: boolean;
  emailDetailRef: RefObject<HTMLDivElement | null>;
  onTogglePanel: () => void;
  onClose: () => void;
}

export const SplitViewPanel: React.FC<SplitViewPanelProps> = ({
  selectedEmailId,
  panelExpanded,
  splitPosition,
  isResizing,
  emailDetailRef,
  onTogglePanel,
  onClose,
}) => {
  const { t } = useTranslation();
  
  return (
    <div 
      ref={emailDetailRef}
      tabIndex={0}
      style={{
        flex: panelExpanded ? 1 : `0 0 ${100 - splitPosition}%`,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: theme.colors.background.paper,
        borderLeft: `1px solid ${theme.colors.border.light}`,
        transition: isResizing ? 'none' : 'flex 0.3s ease',
        overflow: 'hidden',
      }}
    >
      {/* Panel Header with buttons */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: theme.spacing.md,
        borderBottom: `1px solid ${theme.colors.border.light}`,
        backgroundColor: theme.colors.background.subtle,
      }}>
        <div style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary }}>
          {t('inbox.emailDetails')}
        </div>
        <div style={{ display: 'flex', gap: theme.spacing.xs }}>
          <button
            onClick={() => {
              window.open(`/email/${selectedEmailId}`, '_blank');
            }}
            style={{
              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
              backgroundColor: 'transparent',
              border: `1px solid ${theme.colors.border.medium}`,
              borderRadius: theme.borderRadius.sm,
              cursor: 'pointer',
              fontSize: theme.typography.fontSize.xs,
              color: theme.colors.text.secondary,
            }}
            title={t('inbox.openInNewTab')}
          >
            {EMOJI_EXPAND}
          </button>
          <button
            onClick={onClose}
            style={{
              padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
              backgroundColor: 'transparent',
              border: `1px solid ${theme.colors.border.medium}`,
              borderRadius: theme.borderRadius.sm,
              cursor: 'pointer',
              fontSize: theme.typography.fontSize.xs,
              color: theme.colors.text.secondary,
            }}
            title={t('inbox.closePanel')}
          >
            {EMOJI_CLOSE}
          </button>
        </div>
      </div>
      
      {/* EmailDetail component */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <EmailDetail emailId={selectedEmailId} compactMode={true} />
      </div>
    </div>
  );
};

