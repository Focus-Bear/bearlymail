import { useCallback, useState } from 'react';
import { Email } from 'types/email';

interface StarDiscrepancyModal {
  show: boolean;
  emailId: string;
  userStarCount: number;
  predictedStarCount: number;
  emailSubject?: string;
}

interface PriorityOverrideModal {
  show: boolean;
  emailId: string;
  originalPriorityScore: number;
  newPriorityScore: number;
  context?: 'archive' | 'star' | 'manual';
  emailSubject?: string;
}

interface UrgencyOverrideModal {
  show: boolean;
  threadId: string;
  currentUrgencyScore: number;
}

interface PriorityFeedbackModal {
  show: boolean;
  emailId: string;
  currentPriorityScore: number;
}

interface UseModalsReturn {
  starDiscrepancyModal: StarDiscrepancyModal | null;
  setStarDiscrepancyModal: React.Dispatch<React.SetStateAction<StarDiscrepancyModal | null>>;
  priorityOverrideModal: PriorityOverrideModal | null;
  setPriorityOverrideModal: React.Dispatch<React.SetStateAction<PriorityOverrideModal | null>>;
  urgencyOverrideModal: UrgencyOverrideModal | null;
  setUrgencyOverrideModal: React.Dispatch<React.SetStateAction<UrgencyOverrideModal | null>>;
  priorityFeedbackModal: PriorityFeedbackModal | null;
  setPriorityFeedbackModal: React.Dispatch<React.SetStateAction<PriorityFeedbackModal | null>>;
  blockConfirmEmail: Email | null;
  setBlockConfirmEmail: React.Dispatch<React.SetStateAction<Email | null>>;
  showStarDiscrepancy: (
    emailId: string,
    userStarCount: number,
    predictedStarCount: number,
    emailSubject?: string
  ) => void;
  hideStarDiscrepancy: () => void;
  showPriorityOverride: (
    emailId: string,
    originalPriorityScore: number,
    newPriorityScore: number,
    context?: 'archive' | 'star' | 'manual',
    emailSubject?: string
  ) => void;
  hidePriorityOverride: () => void;
  showUrgencyOverride: (threadId: string, currentUrgencyScore: number) => void;
  hideUrgencyOverride: () => void;
  showPriorityFeedback: (emailId: string, currentPriorityScore: number) => void;
  hidePriorityFeedback: () => void;
  showBlockConfirm: (email: Email) => void;
  hideBlockConfirm: () => void;
}

export function useModals(): UseModalsReturn {
  const [starDiscrepancyModal, setStarDiscrepancyModal] = useState<StarDiscrepancyModal | null>(null);
  const [priorityOverrideModal, setPriorityOverrideModal] = useState<PriorityOverrideModal | null>(null);
  const [urgencyOverrideModal, setUrgencyOverrideModal] = useState<UrgencyOverrideModal | null>(null);
  const [priorityFeedbackModal, setPriorityFeedbackModal] = useState<PriorityFeedbackModal | null>(null);
  const [blockConfirmEmail, setBlockConfirmEmail] = useState<Email | null>(null);

  const showStarDiscrepancy = useCallback(
    (emailId: string, userStarCount: number, predictedStarCount: number, emailSubject?: string) => {
      setStarDiscrepancyModal({
        show: true,
        emailId,
        userStarCount,
        predictedStarCount,
        emailSubject,
      });
    },
    []
  );

  const hideStarDiscrepancy = useCallback(() => {
    setStarDiscrepancyModal(null);
  }, []);

  const showPriorityOverride = useCallback(
    (
      emailId: string,
      originalPriorityScore: number,
      newPriorityScore: number,
      context: 'archive' | 'star' | 'manual' = 'manual',
      emailSubject?: string
    ) => {
      setPriorityOverrideModal({
        show: true,
        emailId,
        originalPriorityScore,
        newPriorityScore,
        context,
        emailSubject,
      });
    },
    []
  );

  const hidePriorityOverride = useCallback(() => {
    setPriorityOverrideModal(null);
  }, []);

  const showUrgencyOverride = useCallback((threadId: string, currentUrgencyScore: number) => {
    setUrgencyOverrideModal({
      show: true,
      threadId,
      currentUrgencyScore,
    });
  }, []);

  const hideUrgencyOverride = useCallback(() => {
    setUrgencyOverrideModal(null);
  }, []);

  const showPriorityFeedback = useCallback((emailId: string, currentPriorityScore: number) => {
    setPriorityFeedbackModal({
      show: true,
      emailId,
      currentPriorityScore,
    });
  }, []);

  const hidePriorityFeedback = useCallback(() => {
    setPriorityFeedbackModal(null);
  }, []);

  const showBlockConfirm = useCallback((email: Email) => {
    setBlockConfirmEmail(email);
  }, []);

  const hideBlockConfirm = useCallback(() => {
    setBlockConfirmEmail(null);
  }, []);

  return {
    starDiscrepancyModal,
    setStarDiscrepancyModal,
    priorityOverrideModal,
    setPriorityOverrideModal,
    urgencyOverrideModal,
    setUrgencyOverrideModal,
    priorityFeedbackModal,
    setPriorityFeedbackModal,
    blockConfirmEmail,
    setBlockConfirmEmail,
    showStarDiscrepancy,
    hideStarDiscrepancy,
    showPriorityOverride,
    hidePriorityOverride,
    showUrgencyOverride,
    hideUrgencyOverride,
    showPriorityFeedback,
    hidePriorityFeedback,
    showBlockConfirm,
    hideBlockConfirm,
  };
}
