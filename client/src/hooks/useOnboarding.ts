import { useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import { API_URL } from '../config/api';

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

export function useOnboarding({
  user,
  authLoading,
  refreshUser,
  onScanComplete,
}: UseOnboardingProps): UseOnboardingReturn {
  const [tourStep, setTourStep] = useState<number | null>(null);
  const [showScanModal, setShowScanModal] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);

  // Check if user needs to see tour
  useEffect(() => {
    if (authLoading) return;

    if (user && !user.hasSeenTour) {
      setTourStep(0);
      return;
    }

    const shouldShowScanModal = user &&
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

  // Poll for scan progress
  useEffect(() => {
    if (!isScanning) return;

    const progressInterval = setInterval(async () => {
      try {
        const response = await axios.get(`${API_URL}/onboarding/scan-progress`);
        if (response.data.progress) {
          const { current, total } = response.data.progress;
          setScanProgress({ current, total });

          if (total > 0 && current >= total) {
            clearInterval(progressInterval);
            setIsScanning(false);
            await new Promise(resolve => setTimeout(resolve, 1000));
            await refreshUser();
            onScanComplete?.();
          }
        }
      } catch (error) {
        console.error('Error fetching scan progress:', error);
      }
    }, 2000);

    return () => clearInterval(progressInterval);
  }, [isScanning, refreshUser, onScanComplete]);

  const markTourComplete = useCallback(async () => {
    try {
      await axios.put(`${API_URL}/users/tour-complete`);
      await refreshUser();
    } catch (error) {
      console.error('Error marking tour complete:', error);
    }
  }, [refreshUser]);

  const handleNextTourStep = useCallback((totalSteps: number) => {
    if (tourStep !== null && tourStep < totalSteps - 1) {
      setTourStep(tourStep + 1);
    } else {
      setTourStep(null);
      markTourComplete();
    }
  }, [tourStep, markTourComplete]);

  const handleSkipTour = useCallback(async () => {
    setTourStep(null);
    await markTourComplete();
  }, [markTourComplete]);

  const handleStartScan = useCallback(async () => {
    setShowScanModal(false);
    setIsScanning(true);
    setScanProgress({ current: 0, total: 0 });

    try {
      await axios.post(`${API_URL}/onboarding/start-scan`);
    } catch (error) {
      console.error('Error starting scan:', error);
      setIsScanning(false);
    }
  }, []);

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
