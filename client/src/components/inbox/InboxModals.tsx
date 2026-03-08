import React from 'react';

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
  } | null;
  priorityOverrideModal: {
    show: boolean;
    emailId: string;
    originalPriorityScore: number;
    newPriorityScore: number;
    context?: typeof ANIMATION_TYPE_ARCHIVE | 'star' | 'manual';
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
  return (
    <>
      <ConfirmModal
        isOpen={!!modals.blockConfirmEmail}
        icon="🚫"
        title="Block Sender"
        message={`Block all future emails from ${modals.blockConfirmEmail?.fromName || modals.blockConfirmEmail?.from || 'this sender'}? This email and any future emails from them will be automatically archived.`}
        confirmLabel="Block Sender"
        cancelLabel="Cancel"
        onConfirm={onConfirmBlockSender}
        onCancel={onHideBlockConfirm}
      />

      {modals.starDiscrepancyModal?.show && (
        <StarDiscrepancyModal
          emailId={modals.starDiscrepancyModal.emailId}
          userStarCount={modals.starDiscrepancyModal.userStarCount}
          predictedStarCount={modals.starDiscrepancyModal.predictedStarCount}
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
