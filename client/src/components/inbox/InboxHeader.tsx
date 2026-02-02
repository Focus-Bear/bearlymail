import React, { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { InboxMode } from 'types/email';
import { InboxHeaderTabs, InboxHeaderActions } from 'components/inbox/header';

interface TabCounts {
  triage: number;
  action: number;
  followUp: number;
}

interface InboxHeaderProps {
  mode: InboxMode;
  setMode: (mode: InboxMode) => void;
  loadingModeSwitch: boolean;
  hasRunAnalysis: boolean | null;
  triageTabRef: RefObject<HTMLButtonElement | null>;
  actionTabRef: RefObject<HTMLButtonElement | null>;
  followUpTabRef: RefObject<HTMLButtonElement | null>;
  tabCounts?: TabCounts | null;
}

export const InboxHeader: React.FC<InboxHeaderProps> = ({
  mode,
  setMode,
  loadingModeSwitch,
  hasRunAnalysis,
  triageTabRef,
  actionTabRef,
  followUpTabRef,
  tabCounts,
}) => {
  const { t } = useTranslation();

  return (
    <header
      style={{
        padding: `${theme.spacing.sm} ${theme.spacing['2xl']}`,
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
            marginBottom: 0,
          }}
        >
          {t('inbox.title')}
        </h1>
        <div
          style={{
            display: 'flex',
            gap: theme.spacing.md,
            alignItems: 'center',
            marginTop: theme.spacing.xs,
          }}
        >
          <InboxHeaderTabs
            mode={mode}
            setMode={setMode}
            loadingModeSwitch={loadingModeSwitch}
            triageTabRef={triageTabRef}
            actionTabRef={actionTabRef}
            followUpTabRef={followUpTabRef}
            tabCounts={tabCounts}
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




