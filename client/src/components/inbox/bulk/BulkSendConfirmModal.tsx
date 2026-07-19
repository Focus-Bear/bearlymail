import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';
import { captureEvent } from 'utils/posthog';

import { FollowUpPreviewList } from 'components/inbox/bulk/FollowUpPreviewList';
import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { COLOR_TRANSPARENT } from 'constants/colors';
import { STRING_NONE } from 'constants/strings';
import { ThreadWithFollowUp } from 'hooks/useFollowUps';

interface BulkSendConfirmModalProps {
  selectedCount: number;
  selectedFollowUps: Array<{ id: string; draftFollowUp?: string | null }>;
  selectedThreads: ThreadWithFollowUp[];
  isSending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const BulkSendConfirmModal: React.FC<BulkSendConfirmModalProps> = ({
  selectedCount,
  selectedFollowUps,
  selectedThreads,
  isSending,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          backgroundColor: theme.colors.background.paper,
          borderRadius: theme.borderRadius.lg,
          padding: theme.spacing.xl,
          maxWidth: '600px',
          maxHeight: '80vh',
          overflow: 'auto',
          width: '90%',
        }}
        onClick={event => event.stopPropagation()}
      >
        <h3
          style={{
            margin: 0,
            marginBottom: theme.spacing.lg,
            fontSize: theme.typography.fontSize.xl,
            fontWeight: theme.typography.fontWeight.bold,
          }}
        >
          {t('inbox.confirmBulkSend', { count: selectedCount })}
        </h3>

        <FollowUpPreviewList
          selectedFollowUps={selectedFollowUps}
          selectedThreads={selectedThreads}
          selectedCount={selectedCount}
        />

        <div style={{ display: 'flex', gap: theme.spacing.md, justifyContent: 'flex-end' }}>
          <button
            onClick={() => {
              captureEvent(ANALYTICS_EVENTS.BULK_FOLLOWUPS_SEND_CANCELLED);
              onCancel();
            }}
            style={{
              padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
              backgroundColor: COLOR_TRANSPARENT,
              color: theme.colors.text.secondary,
              border: `1px solid ${theme.colors.border.light}`,
              borderRadius: theme.borderRadius.md,
              cursor: 'pointer',
            }}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={() => {
              captureEvent(ANALYTICS_EVENTS.BULK_FOLLOWUPS_SEND_CONFIRMED, { followup_count: selectedCount });
              onConfirm();
            }}
            disabled={isSending}
            style={{
              padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
              backgroundColor: theme.colors.primary.main,
              color: theme.colors.background.paper,
              border: STRING_NONE,
              borderRadius: theme.borderRadius.md,
              cursor: isSending ? 'wait' : 'pointer',
            }}
          >
            {isSending ? t('inbox.sending') : t('common.send')}
          </button>
        </div>
      </div>
    </div>
  );
};
