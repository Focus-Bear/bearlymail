import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface ScanProgress {
  current: number;
  total: number;
}

interface UseOnboardingProps {
  user: any;
  authLoading: boolean;
  refreshUser: () => Promise<void>;
  onScanComplete?: () => void;
}

interface UseOnboardingReturn {
  tourStep: number | null;
  setTourStep: React.Dispatch<React.SetStateAction<number | null>>;
  showScanModal: boolean;
  setShowScanModal: React.Dispatch<React.SetStateAction<boolean>>;
  isScanning: boolean;
  scanProgress: ScanProgress | null;
  markTourComplete: () => Promise<void>;
  handleNextTourStep: (totalSteps: number) => void;
  handleSkipTour: () => Promise<void>;
  handleStartScan: () => Promise<void>;
}

export function useOnboarding({ user, authLoading, refreshUser }: UseOnboardingProps): UseOnboardingReturn {
  const navigate = useNavigate();
  const [tourStep, setTourStep] = useState<number | null>(null);
  const [showScanModal, setShowScanModal] = useState(false);
  const [isScanning] = useState(false);
  const [scanProgress] = useState<ScanProgress | null>(null);

  // Check if user needs to see tour
  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (user && !user.hasSeenTour) {
      setTourStep(0);
      return;
    }

    const shouldShowScanModal =
      user &&
      user.hasSeenTour &&
      (user.hasScannedHistory === false || user.hasScannedHistory === undefined) &&
      !isScanning &&
      !showScanModal;

    if (shouldShowScanModal) {
      setShowScanModal(true);
    } else if (user && user.hasScannedHistory === true) {
      setShowScanModal(false);
    }
  }, [user, authLoading, isScanning, showScanModal]);

  const markTourComplete = useCallback(async () => {
    try {
      const axios = (await import('axios')).default;
      const { API_URL } = await import('config/api');
      await axios.put(`${API_URL}/users/tour-complete`);
      await refreshUser();
    } catch (error) {
      console.error('Error marking tour complete:', error);
    }
  }, [refreshUser]);

  const handleNextTourStep = useCallback(
    (totalSteps: number) => {
      if (tourStep !== null && tourStep < totalSteps - 1) {
        setTourStep(tourStep + 1);
      } else {
        setTourStep(null);
        markTourComplete();
      }
    },
    [tourStep, markTourComplete]
  );

  const handleSkipTour = useCallback(async () => {
    setTourStep(null);
    await markTourComplete();
  }, [markTourComplete]);

  const handleStartScan = useCallback(async () => {
    setShowScanModal(false);
    // Navigate to settings page with autoAnalyze param to trigger context analysis
    navigate('/settings?autoAnalyze=true#context');
  }, [navigate]);

  return {
    tourStep,
    setTourStep,
    showScanModal,
    setShowScanModal,
    isScanning,
    scanProgress,
    markTourComplete,
    handleNextTourStep,
    handleSkipTour,
    handleStartScan,
  };
}
