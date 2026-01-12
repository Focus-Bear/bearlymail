import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { EmailAccountsSection } from 'components/settings/email-delivery/EmailAccountsSection';
import { EmailBatchingSection } from 'components/settings/email-delivery/EmailBatchingSection';
import { BlockedSendersSection } from 'components/settings/email-delivery/BlockedSendersSection';

interface BlockedSender {
  id: string;
  email: string;
  senderName?: string;
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
  googleAccounts: any[];
  office365Accounts: any[];
  zohoAccounts: any[];
  batchSchedule: BatchSchedule;
  blockedSenders: BlockedSender[];
  newDeliveryTime: string;
  onFetchData: () => Promise<void>;
  onBatchScheduleChange: (schedule: BatchSchedule) => void;
  onNewDeliveryTimeChange: (time: string) => void;
  onUnblockSender: (id: string) => Promise<void>;
}

export const EmailDeliverySection: React.FC<EmailDeliverySectionProps> = ({
  googleAccounts,
  office365Accounts,
  zohoAccounts,
  batchSchedule,
  blockedSenders,
  newDeliveryTime,
  onFetchData,
  onBatchScheduleChange,
  onNewDeliveryTimeChange,
  onUnblockSender,
}) => {
  const { t } = useTranslation();
  
  return (
    <div id="email-delivery" style={{ marginBottom: theme.spacing.xl }}>
      <h2 style={{
        color: theme.colors.text.primary,
        marginBottom: theme.spacing.lg,
        fontSize: theme.typography.fontSize['2xl'],
        fontWeight: theme.typography.fontWeight.semibold,
      }}>
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
      <BlockedSendersSection
        blockedSenders={blockedSenders}
        onUnblockSender={onUnblockSender}
      />
    </div>
  );
};

