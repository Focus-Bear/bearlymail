import React from 'react';

import { ReloginBanner, ScanModal, ScanNotification, TourOverlay, UrgentNotification } from 'components/inbox/overlays';
import { TourStep } from 'components/inbox/overlays/tourSteps';

interface ScanProgress {
  current: number;
  total: number;
}

interface UrgentEmail {
  subject: string;
  from: string;
  priorityScore: number;
}

interface InboxOverlaysProps {
  // Tour props
  tourStep: number | null;
  tourSteps: TourStep[];
  onSkipTour: () => void;
  onNextTourStep: () => void;
  onPrevTourStep: () => void;

  // Scan modal props
  showScanModal: boolean;
  isScanning: boolean;
  onStartScan: () => void;
  onDismissScan: () => void;

  // Scan notification props
  scanNotification: { show: boolean; progress: ScanProgress | null };

  // Urgent notification props
  urgentNotification: { show: boolean; count: number; emails: UrgentEmail[] };
  onDismissUrgent: () => void;

  // Re-login banner props
  needsRelogin?: boolean;
  onLogout: () => void;
}

/**
 * Inbox overlays component
 * Orchestrates all overlay components (tour, scan, notifications, etc.)
 */
export const InboxOverlays: React.FC<InboxOverlaysProps> = ({
  tourStep,
  tourSteps,
  onSkipTour,
  onNextTourStep,
  onPrevTourStep,
  showScanModal,
  isScanning,
  onStartScan,
  onDismissScan,
  scanNotification,
  urgentNotification,
  onDismissUrgent,
  needsRelogin,
  onLogout,
}) => {
  return (
    <>
      {tourStep !== null && (
        <TourOverlay
          tourStep={tourStep}
          tourSteps={tourSteps}
          onSkipTour={onSkipTour}
          onNextTourStep={onNextTourStep}
          onPrevTourStep={onPrevTourStep}
        />
      )}

      {showScanModal && !isScanning && <ScanModal onStartScan={onStartScan} onDismissScan={onDismissScan} />}

      {scanNotification.show && <ScanNotification progress={scanNotification.progress} />}

      {urgentNotification.show && (
        <UrgentNotification
          count={urgentNotification.count}
          emails={urgentNotification.emails}
          onDismiss={onDismissUrgent}
        />
      )}

      {needsRelogin && <ReloginBanner onLogout={onLogout} />}
    </>
  );
};
