import React from 'react';
import { useTranslation } from 'react-i18next';

import { ConfirmModal } from 'components/ConfirmModal';
import { UrgencyOverrideModal } from 'components/inbox/UrgencyOverrideModal';
import { PriorityFeedbackModal } from 'components/priority/PriorityFeedbackModal';
import { PriorityOverrideModal } from 'components/priority/PriorityOverrideModal';
import { StarDiscrepancyModal } from 'components/priority/StarDiscrepancyModal';
import { API_URL } from 'config/api';
import { ANIMATION_TYPE_ARCHIVE } from 'constants/strings';

interface ModalsState {
  blockConfirmEmail: { id: string; from: string; fromName?: string } | null;
  starDiscrepancyModal: {
    show: boolean;
    emailId: string;
    userStarCount: number;
    predictedStarCount: number;
    emailSubject?: string;
  } | null;
  priorityOverrideModal: {
    show: boolean;
    emailId: string;
    originalPriorityScore: number;
    newPriorityScore: number;
    context?: typeof ANIMATION_TYPE_ARCHIVE | 'star' | 'manual';
    emailSubject?: string;
  } | null;
  urgencyOverrideModal: {
    show: boolean;
    threadId: string;
    currentUrgencyScore: number;
  } | null;
  priorityFeedbackModal: {
    show: boolean;
    emailId: string;
    currentPriorityScore: number;
  } | null;
}

interface InboxModalsProps {
  modals: ModalsState;
  onHideBlockConfirm: () => void;
  onConfirmBlockSender: () => void;
  onHideStarDiscrepancy: () => void;
  onHidePriorityOverride: () => void;
  onHideUrgencyOverride: () => void;
  onHidePriorityFeedback: () => void;
  onRefreshEmails: () => void;
}

export const InboxModals: React.FC<InboxModalsProps> = ({
  modals,
  onHideBlockConfirm,
  onConfirmBlockSender,
  onHideStarDiscrepancy,
  onHidePriorityOverride,
  onHideUrgencyOverride,
  onHidePriorityFeedback,
  onRefreshEmails,
}) => {
  const { t } = useTranslation();

  return (
    <>
      <ConfirmModal
        isOpen={!!modals.blockConfirmEmail}
        icon="🚫"
        title={t('inbox.blockConfirm.title', { defaultValue: 'Block Sender' })}
        message={t('inbox.blockConfirm.message', {
          from:
            modals.blockConfirmEmail?.fromName ||
            modals.blockConfirmEmail?.from ||
            t('inbox.blockConfirm.thisSender', { defaultValue: 'this sender' }),
          defaultValue:
            'Block all future emails from {{from}}? This email and any future emails from them will be automatically archived.',
        })}
        confirmLabel={t('inbox.blockConfirm.confirm', { defaultValue: 'Block Sender' })}
        cancelLabel={t('common.cancel', { defaultValue: 'Cancel' })}
        onConfirm={onConfirmBlockSender}
        onCancel={onHideBlockConfirm}
      />

      {modals.starDiscrepancyModal?.show && (
        <StarDiscrepancyModal
          emailId={modals.starDiscrepancyModal.emailId}
          userStarCount={modals.starDiscrepancyModal.userStarCount}
          predictedStarCount={modals.starDiscrepancyModal.predictedStarCount}
          emailSubject={modals.starDiscrepancyModal.emailSubject}
          onClose={onHideStarDiscrepancy}
          onSubmitted={() => {
            onHideStarDiscrepancy();
            onRefreshEmails();
          }}
        />
      )}

      {modals.priorityOverrideModal?.show && (
        <PriorityOverrideModal
          emailId={modals.priorityOverrideModal.emailId}
          originalPriorityScore={modals.priorityOverrideModal.originalPriorityScore}
          newPriorityScore={modals.priorityOverrideModal.newPriorityScore}
          context={modals.priorityOverrideModal.context}
          emailSubject={modals.priorityOverrideModal.emailSubject}
          onClose={onHidePriorityOverride}
          onSubmitted={async () => {
            // If context is 'archive', actually archive the email after override is submitted
            if (modals.priorityOverrideModal?.context === ANIMATION_TYPE_ARCHIVE) {
              try {
                const axios = (await import('axios')).default;
                await axios.put(`${API_URL}/emails/${modals.priorityOverrideModal.emailId}/archive`);
              } catch (error) {
                console.error('Error archiving email after override:', error);
              }
            }
            onHidePriorityOverride();
            onRefreshEmails();
          }}
        />
      )}

      {modals.urgencyOverrideModal?.show && (
        <UrgencyOverrideModal
          threadId={modals.urgencyOverrideModal.threadId}
          currentUrgencyScore={modals.urgencyOverrideModal.currentUrgencyScore}
          onClose={onHideUrgencyOverride}
          onSubmitted={() => {
            onHideUrgencyOverride();
            onRefreshEmails();
          }}
        />
      )}

      {modals.priorityFeedbackModal?.show && (
        <PriorityFeedbackModal
          emailId={modals.priorityFeedbackModal.emailId}
          currentPriorityScore={modals.priorityFeedbackModal.currentPriorityScore}
          onClose={onHidePriorityFeedback}
          onSubmitted={() => {
            onHidePriorityFeedback();
            onRefreshEmails();
          }}
        />
      )}
    </>
  );
};
