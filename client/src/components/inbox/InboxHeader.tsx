import React, { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { InboxMode } from 'types/email';
import { InboxHeaderTabs, InboxHeaderActions } from 'components/inbox/header';

interface InboxHeaderProps {
  mode: InboxMode;
  setMode: (mode: InboxMode) => void;
  loadingModeSwitch: boolean;
  hasRunAnalysis: boolean | null;
  triageTabRef: RefObject<HTMLButtonElement | null>;
  actionTabRef: RefObject<HTMLButtonElement | null>;
  followUpTabRef: RefObject<HTMLButtonElement | null>;
}

export const InboxHeader: React.FC<InboxHeaderProps> = ({
  mode,
  setMode,
  loadingModeSwitch,
  hasRunAnalysis,
  triageTabRef,
  actionTabRef,
  followUpTabRef,
}) => {
  const { t } = useTranslation();

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
        hasRunAnalysis={hasRunAnalysis}
      />
    </header>
  );
};




