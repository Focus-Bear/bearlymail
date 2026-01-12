import React, { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { InboxMode } from 'types/email';
import { InboxHeaderTabs, InboxHeaderActions } from 'components/inbox/header';

interface InboxHeaderProps {
  mode: InboxMode;
  setMode: (mode: InboxMode) => void;
  loadingModeSwitch: boolean;
  nextDelivery: Date | null;
  hasRunAnalysis: boolean | null;
  triageTabRef: RefObject<HTMLButtonElement | null>;
  actionTabRef: RefObject<HTMLButtonElement | null>;
  followUpTabRef: RefObject<HTMLButtonElement | null>;
}

export const InboxHeader: React.FC<InboxHeaderProps> = ({
  mode,
  setMode,
  loadingModeSwitch,
  nextDelivery,
  hasRunAnalysis,
  triageTabRef,
  actionTabRef,
  followUpTabRef,
}) => {
  const { t } = useTranslation();

  const getNextDeliveryText = (): string | null => {
    if (!nextDelivery) return null;
    const now = new Date();
    const diffMs = nextDelivery.getTime() - now.getTime();
    const diffMins = Math.round(diffMs / (1000 * 60));
    if (diffMins <= 0) return null;

    const diffHours = Math.floor(diffMins / 60);
    const remainingMins = diffMins % 60;
    if (diffMins < 60) {
      return `${diffMins}m`;
    }
    if (remainingMins === 0) {
      return `${diffHours}h`;
    }
    return `${diffHours}h ${remainingMins}m`;
  };

  const nextDeliveryText = getNextDeliveryText();

  return (
    <header
      style={{
        padding: `${theme.spacing.lg} ${theme.spacing['2xl']}`,
        backgroundColor: theme.colors.background.paper,
        borderBottom: `1px solid ${theme.colors.border.light}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <div>
        <h1
          style={{
            color: theme.colors.text.primary,
            fontSize: theme.typography.fontSize['2xl'],
            fontWeight: theme.typography.fontWeight.bold,
            marginBottom: theme.spacing.xs,
          }}
        >
          {t('inbox.title')}
        </h1>
        <div
          style={{
            display: 'flex',
            gap: theme.spacing.md,
            alignItems: 'center',
            marginTop: theme.spacing.sm,
          }}
        >
          <InboxHeaderTabs
            mode={mode}
            setMode={setMode}
            loadingModeSwitch={loadingModeSwitch}
            triageTabRef={triageTabRef}
            actionTabRef={actionTabRef}
            followUpTabRef={followUpTabRef}
          />
        </div>
      </div>

      <InboxHeaderActions
        mode={mode}
        nextDeliveryText={nextDeliveryText}
        hasRunAnalysis={hasRunAnalysis}
      />
    </header>
  );
};




