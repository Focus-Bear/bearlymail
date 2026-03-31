import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { BlockedKeywordsSection } from 'components/settings/email-delivery/BlockedKeywordsSection';
import { BlockedSendersSection } from 'components/settings/email-delivery/BlockedSendersSection';
import { EmailAccountsSection } from 'components/settings/email-delivery/EmailAccountsSection';
import { EmailBatchingSection } from 'components/settings/email-delivery/EmailBatchingSection';

interface BlockedSender {
  id: string;
  email: string;
  senderName?: string;
  reason?: string;
  blockedAt: string;
}

interface BlockedKeyword {
  id: string;
  keyword: string;
  exactMatch: boolean;
  reason?: string;
  blockedAt: string;
}

interface BatchSchedule {
  deliveryDays: number[];
  deliveryTimes: string[];
  timezone: string;
  isEnabled: boolean;
  urgentBypassSchedule: boolean;
}

interface EmailDeliverySectionProps {
  googleAccounts: Array<{ id: string; email: string; name?: string; isPrimary?: boolean; isSSO?: boolean }>;
  office365Accounts: Array<{ id: string; email: string; name?: string; isPrimary?: boolean }>;
  zohoAccounts: Array<{ id: string; email: string; name?: string; isPrimary?: boolean }>;
  batchSchedule: BatchSchedule;
  blockedSenders: BlockedSender[];
  blockedKeywords: BlockedKeyword[];
  newDeliveryTime: string;
  onFetchData: () => Promise<void>;
  onBatchScheduleChange: (schedule: BatchSchedule) => void;
  onNewDeliveryTimeChange: (time: string) => void;
  onUnblockSender: (id: string) => Promise<void>;
  onUnblockKeyword: (id: string) => Promise<void>;
  onAddKeyword: (keyword: string, exactMatch: boolean, reason?: string) => Promise<void>;
}

export const EmailDeliverySection: React.FC<EmailDeliverySectionProps> = ({
  googleAccounts,
  office365Accounts,
  zohoAccounts,
  batchSchedule,
  blockedSenders,
  blockedKeywords,
  newDeliveryTime,
  onFetchData,
  onBatchScheduleChange,
  onNewDeliveryTimeChange,
  onUnblockSender,
  onUnblockKeyword,
  onAddKeyword,
}) => {
  const { t } = useTranslation();

  return (
    <div id="email-delivery" style={{ marginBottom: theme.spacing.xl }}>
      <h2
        style={{
          color: theme.colors.text.primary,
          marginBottom: theme.spacing.lg,
          fontSize: theme.typography.fontSize['2xl'],
          fontWeight: theme.typography.fontWeight.semibold,
        }}
      >
        {t('settings.nav.emailDelivery')}
      </h2>
      <EmailAccountsSection
        googleAccounts={googleAccounts}
        office365Accounts={office365Accounts}
        zohoAccounts={zohoAccounts}
        onFetchData={onFetchData}
      />
      <EmailBatchingSection
        batchSchedule={batchSchedule}
        newDeliveryTime={newDeliveryTime}
        onBatchScheduleChange={onBatchScheduleChange}
        onNewDeliveryTimeChange={onNewDeliveryTimeChange}
      />
      <BlockedSendersSection blockedSenders={blockedSenders} onUnblockSender={onUnblockSender} />
      <BlockedKeywordsSection
        blockedKeywords={blockedKeywords}
        onUnblockKeyword={onUnblockKeyword}
        onAddKeyword={onAddKeyword}
      />
    </div>
  );
};
