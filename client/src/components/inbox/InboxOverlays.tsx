import React, { RefObject } from 'react';

import { ReloginBanner, ScanModal, ScanNotification, TourOverlay, UrgentNotification } from 'components/inbox/overlays';

interface TourStep {
  title: string;
  content: string;
}

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
  triageTabRef: RefObject<HTMLButtonElement | null>;
  actionTabRef: RefObject<HTMLButtonElement | null>;
  deliverBtnRef: RefObject<HTMLButtonElement | null>;

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
  triageTabRef,
  actionTabRef,
  deliverBtnRef,
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
          triageTabRef={triageTabRef}
          actionTabRef={actionTabRef}
          deliverBtnRef={deliverBtnRef}
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
