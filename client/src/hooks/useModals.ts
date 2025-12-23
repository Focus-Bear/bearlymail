import { useState, useCallback } from 'react';
import { Email } from '../types/email';

interface StarDiscrepancyModal {
  show: boolean;
  emailId: string;
  userStarCount: number;
  predictedStarCount: number;
}

interface PriorityOverrideModal {
  show: boolean;
  emailId: string;
  originalPriorityScore: number;
  newPriorityScore: number;
}

interface UrgencyOverrideModal {
  show: boolean;
  threadId: string;
  currentUrgencyScore: number;
}

interface UseModalsReturn {
  starDiscrepancyModal: StarDiscrepancyModal | null;
  setStarDiscrepancyModal: React.Dispatch<React.SetStateAction<StarDiscrepancyModal | null>>;
  priorityOverrideModal: PriorityOverrideModal | null;
  setPriorityOverrideModal: React.Dispatch<React.SetStateAction<PriorityOverrideModal | null>>;
  urgencyOverrideModal: UrgencyOverrideModal | null;
  setUrgencyOverrideModal: React.Dispatch<React.SetStateAction<UrgencyOverrideModal | null>>;
  blockConfirmEmail: Email | null;
  setBlockConfirmEmail: React.Dispatch<React.SetStateAction<Email | null>>;
  showStarDiscrepancy: (emailId: string, userStarCount: number, predictedStarCount: number) => void;
  hideStarDiscrepancy: () => void;
  showPriorityOverride: (emailId: string, originalPriorityScore: number, newPriorityScore: number) => void;
  hidePriorityOverride: () => void;
  showUrgencyOverride: (threadId: string, currentUrgencyScore: number) => void;
  hideUrgencyOverride: () => void;
  showBlockConfirm: (email: Email) => void;
  hideBlockConfirm: () => void;
}

export function useModals(): UseModalsReturn {
  const [starDiscrepancyModal, setStarDiscrepancyModal] = useState<StarDiscrepancyModal | null>(null);
  const [priorityOverrideModal, setPriorityOverrideModal] = useState<PriorityOverrideModal | null>(null);
  const [urgencyOverrideModal, setUrgencyOverrideModal] = useState<UrgencyOverrideModal | null>(null);
  const [blockConfirmEmail, setBlockConfirmEmail] = useState<Email | null>(null);

  const showStarDiscrepancy = useCallback((emailId: string, userStarCount: number, predictedStarCount: number) => {
    setStarDiscrepancyModal({
      show: true,
      emailId,
      userStarCount,
      predictedStarCount,
    });
  }, []);

  const hideStarDiscrepancy = useCallback(() => {
    setStarDiscrepancyModal(null);
  }, []);

  const showPriorityOverride = useCallback((emailId: string, originalPriorityScore: number, newPriorityScore: number) => {
    setPriorityOverrideModal({
      show: true,
      emailId,
      originalPriorityScore,
      newPriorityScore,
    });
  }, []);

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
    blockConfirmEmail,
    setBlockConfirmEmail,
    showStarDiscrepancy,
    hideStarDiscrepancy,
    showPriorityOverride,
    hidePriorityOverride,
    showUrgencyOverride,
    hideUrgencyOverride,
    showBlockConfirm,
    hideBlockConfirm,
  };
}

