import React, { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from '../../theme/theme';

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
  processTabRef: RefObject<HTMLButtonElement | null>;
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

export const InboxOverlays: React.FC<InboxOverlaysProps> = ({
  tourStep,
  tourSteps,
  onSkipTour,
  onNextTourStep,
  triageTabRef,
  processTabRef,
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
  const { t } = useTranslation();

  return (
    <>
      {/* Simple Modal-based Tour */}
      {tourStep !== null && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 1000,
        }}>
          {/* Dynamic highlight overlay */}
          {(() => {
            let targetElement: HTMLElement | null = null;
            if (tourStep === 1 && triageTabRef.current) {
              targetElement = triageTabRef.current;
            } else if (tourStep === 2 && processTabRef.current) {
              targetElement = processTabRef.current;
            } else if (tourStep === 3 && deliverBtnRef.current) {
              targetElement = deliverBtnRef.current;
            }

            if (targetElement) {
              const rect = targetElement.getBoundingClientRect();
              return (
                <div style={{
                  position: 'fixed',
                  top: rect.top - 4,
                  left: rect.left - 4,
                  width: rect.width + 8,
                  height: rect.height + 8,
                  border: `3px solid ${theme.colors.primary.main}`,
                  borderRadius: theme.borderRadius.full,
                  boxShadow: `0 0 0 4px rgba(59, 130, 246, 0.3)`,
                  pointerEvents: 'none',
                  zIndex: 1001,
                }} />
              );
            }
            return null;
          })()}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: theme.colors.background.paper,
            padding: theme.spacing['2xl'],
            borderRadius: theme.borderRadius.lg,
            boxShadow: theme.shadows.xl,
            maxWidth: '500px',
            textAlign: 'center',
            zIndex: 1002,
          }}>
            <h2 style={{ marginBottom: theme.spacing.md, color: theme.colors.text.primary }}>
              {tourSteps[tourStep].title}
            </h2>
            <p style={{ marginBottom: theme.spacing.xl, color: theme.colors.text.secondary, lineHeight: 1.6 }}>
              {tourSteps[tourStep].content}
            </p>

            <div style={{ display: 'flex', gap: theme.spacing.md, justifyContent: 'center' }}>
              <button
                onClick={onSkipTour}
                style={{
                  padding: `${theme.spacing.md} ${theme.spacing.lg}`,
                  backgroundColor: 'transparent',
                  color: theme.colors.text.secondary,
                  border: `1px solid ${theme.colors.border.medium}`,
                  borderRadius: theme.borderRadius.md,
                  cursor: 'pointer',
                }}
              >
                {t('onboarding.tour.skip')}
              </button>
              <button
                onClick={onNextTourStep}
                style={{
                  padding: `${theme.spacing.md} ${theme.spacing.lg}`,
                  backgroundColor: theme.colors.primary.main,
                  color: 'white',
                  border: 'none',
                  borderRadius: theme.borderRadius.md,
                  cursor: 'pointer',
                  fontWeight: theme.typography.fontWeight.semibold,
                }}
              >
                {tourStep === tourSteps.length - 1 ? t('onboarding.tour.finish') : t('onboarding.tour.next')}
              </button>
            </div>
            <div style={{ marginTop: theme.spacing.md, fontSize: theme.typography.fontSize.sm, color: theme.colors.text.tertiary }}>
              {t('onboarding.tour.stepProgress', { current: tourStep + 1, total: tourSteps.length })}
            </div>
          </div>
        </div>
      )}

      {/* Scan Permission Modal */}
      {showScanModal && !isScanning && (
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: theme.colors.background.overlay,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: theme.colors.background.paper,
            padding: theme.spacing['2xl'],
            borderRadius: theme.borderRadius.lg,
            boxShadow: theme.shadows.xl,
            maxWidth: '500px',
            textAlign: 'center',
          }}>
            <h2 style={{ marginBottom: theme.spacing.md, color: theme.colors.text.primary }}>
              {t('onboarding.scan.title')}
            </h2>
            <p style={{ marginBottom: theme.spacing.xl, color: theme.colors.text.secondary, lineHeight: 1.6 }}>
              {t('onboarding.scan.content')}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md }}>
              <button
                onClick={onStartScan}
                style={{
                  padding: theme.spacing.lg,
                  backgroundColor: theme.colors.primary.main,
                  color: 'white',
                  border: 'none',
                  borderRadius: theme.borderRadius.md,
                  fontWeight: theme.typography.fontWeight.semibold,
                  cursor: 'pointer',
                }}
              >
                {t('onboarding.scan.startScan')}
              </button>
              <button
                onClick={onDismissScan}
                style={{
                  padding: theme.spacing.md,
                  backgroundColor: 'transparent',
                  color: theme.colors.text.secondary,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {t('onboarding.scan.skip')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scan Progress Notification */}
      {scanNotification.show && (
        <div style={{
          position: 'absolute',
          top: '120px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: theme.colors.background.paper,
          padding: theme.spacing.lg,
          borderRadius: theme.borderRadius.lg,
          boxShadow: theme.shadows.xl,
          minWidth: '280px',
          zIndex: 1000,
          border: `2px solid ${theme.colors.primary.main}`,
        }}>
          {scanNotification.progress && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm, marginBottom: theme.spacing.sm }}>
                <div className="animate-spin" style={{
                  width: '16px',
                  height: '16px',
                  border: '2px solid',
                  borderColor: `${theme.colors.primary.main} transparent`,
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                }} />
                <span style={{ fontWeight: theme.typography.fontWeight.medium }}>
                  {t('onboarding.scan.analyzing')}
                </span>
              </div>
              <div style={{
                width: '100%',
                height: '8px',
                backgroundColor: theme.colors.background.subtle,
                borderRadius: theme.borderRadius.full,
                overflow: 'hidden',
                marginBottom: theme.spacing.sm,
              }}>
                <div style={{
                  width: `${scanNotification.progress.total > 0 ? (scanNotification.progress.current / scanNotification.progress.total) * 100 : 0}%`,
                  height: '100%',
                  backgroundColor: theme.colors.primary.main,
                  transition: 'width 0.3s ease',
                }} />
              </div>
              <p style={{
                fontSize: theme.typography.fontSize.sm,
                color: theme.colors.text.secondary,
                textAlign: 'center',
                margin: 0,
              }}>
                {t('onboarding.scan.progress', { current: scanNotification.progress.current, total: scanNotification.progress.total })}
              </p>
            </>
          )}
        </div>
      )}

      {/* Urgent Emails Notification */}
      {urgentNotification.show && (
        <div style={{
          position: 'fixed',
          top: urgentNotification.count > 0 ? theme.spacing.lg : undefined,
          bottom: urgentNotification.count === 0 ? theme.spacing.lg : undefined,
          right: theme.spacing.lg,
          backgroundColor: urgentNotification.count > 0 ? '#FEE2E2' : theme.colors.background.paper,
          padding: theme.spacing.lg,
          borderRadius: theme.borderRadius.lg,
          boxShadow: theme.shadows.xl,
          minWidth: '320px',
          maxWidth: '400px',
          zIndex: 2000,
          border: `2px solid ${urgentNotification.count > 0 ? theme.colors.accent.error : theme.colors.border.light}`,
        }}>
          {urgentNotification.count > 0 ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm, marginBottom: theme.spacing.md }}>
                <span style={{ fontSize: '1.5rem' }}>🚨</span>
                <h3 style={{
                  color: theme.colors.accent.error,
                  margin: 0,
                  fontSize: theme.typography.fontSize.lg,
                  fontWeight: theme.typography.fontWeight.bold,
                }}>
                  {urgentNotification.count} Urgent Email{urgentNotification.count > 1 ? 's' : ''} Found!
                </h3>
              </div>
              <p style={{
                fontSize: theme.typography.fontSize.sm,
                color: theme.colors.text.secondary,
                marginBottom: theme.spacing.md,
              }}>
                You have urgent emails waiting. They'll be delivered at the next batch time.
              </p>
              <div style={{ marginBottom: theme.spacing.md }}>
                {urgentNotification.emails.slice(0, 3).map((email, idx) => (
                  <div key={idx} style={{
                    padding: theme.spacing.sm,
                    backgroundColor: 'white',
                    borderRadius: theme.borderRadius.sm,
                    marginBottom: theme.spacing.xs,
                    border: `1px solid ${theme.colors.border.light}`,
                  }}>
                    <div style={{
                      fontSize: theme.typography.fontSize.sm,
                      fontWeight: theme.typography.fontWeight.medium,
                      color: theme.colors.text.primary,
                      marginBottom: '2px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {email.subject}
                    </div>
                    <div style={{
                      fontSize: theme.typography.fontSize.xs,
                      color: theme.colors.text.tertiary,
                    }}>
                      From: {email.from}
                    </div>
                  </div>
                ))}
                {urgentNotification.count > 3 && (
                  <p style={{
                    fontSize: theme.typography.fontSize.xs,
                    color: theme.colors.text.tertiary,
                    textAlign: 'center',
                    margin: `${theme.spacing.sm} 0 0 0`,
                  }}>
                    +{urgentNotification.count - 3} more urgent email{urgentNotification.count - 3 > 1 ? 's' : ''}
                  </p>
                )}
              </div>
              <button
                onClick={onDismissUrgent}
                style={{
                  marginTop: theme.spacing.md,
                  width: '100%',
                  padding: theme.spacing.sm,
                  backgroundColor: theme.colors.accent.error,
                  color: 'white',
                  border: 'none',
                  borderRadius: theme.borderRadius.md,
                  cursor: 'pointer',
                  fontSize: theme.typography.fontSize.sm,
                  fontWeight: theme.typography.fontWeight.medium,
                }}
              >
                {t('common.dismiss')}
              </button>
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm }}>
              <span>✓</span>
              <p style={{
                fontSize: theme.typography.fontSize.sm,
                color: theme.colors.text.secondary,
                margin: 0,
              }}>
                {t('inbox.noUrgentEmailsFound')}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Re-login Banner */}
      {needsRelogin && (
        <div style={{
          backgroundColor: theme.colors.accent.error,
          color: 'white',
          padding: theme.spacing.md,
          textAlign: 'center',
          fontWeight: theme.typography.fontWeight.medium,
        }}>
          Action Required: Please <a href="/login" style={{ color: 'white', textDecoration: 'underline' }} onClick={onLogout}>log in again</a> to restore email synchronization.
        </div>
      )}
    </>
  );
};
