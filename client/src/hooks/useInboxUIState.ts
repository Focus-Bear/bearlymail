import { useTranslation } from 'react-i18next';
import { useSnoozeInput } from 'hooks/useSnoozeInput';
import { useOnboarding } from 'hooks/useOnboarding';
import { useUrgentNotification } from 'hooks/useUrgentNotification';
import { useDebugPanel } from 'hooks/useDebugPanel';
import { useModals } from 'hooks/useModals';
import { usePriorityTooltip } from 'hooks/usePriorityTooltip';
import { useKeyboardHint } from 'hooks/useKeyboardHint';
import { useSplitView } from 'hooks/useSplitView';
import { useGitHubBatchFetch } from 'hooks/useGitHubBatchFetch';
import { useEmailProcessingPolling } from 'hooks/useEmailProcessingPolling';
import { captureEvent } from 'utils/posthog';
import { useEffect } from 'react';
import { InboxMode } from 'types/email';
import { MODE_FOLLOW_UP } from 'constants/strings';

interface UIStateParams {
  user: any;
  authLoading: boolean;
  refreshUser: () => void;
  fetchEmails: () => void;
  refreshInPlace: () => void;
  mode: InboxMode;
  emails: any[];
  loading: boolean;
}

/**
 * Packages all "UI peripheral" hooks for the inbox - modals, panels, notifications, split view.
 * Also includes background polling and the inbox-viewed tracking effect.
 * Extracted from useInboxState to reduce its statement count.
 */
export function useInboxUIState({ user, authLoading, refreshUser, fetchEmails, refreshInPlace, mode, emails, loading }: UIStateParams) {
  const { t } = useTranslation();
  const snoozeInput = useSnoozeInput();
  const onboarding = useOnboarding({ user, authLoading, refreshUser });
  const urgentNotification = useUrgentNotification();
  const debugPanel = useDebugPanel(() => fetchEmails());
  const modals = useModals();
  const priorityTooltip = usePriorityTooltip();
  const keyboardHint = useKeyboardHint();
  const splitView = useSplitView();

  useGitHubBatchFetch(emails, loading);
  useEmailProcessingPolling({ emails, onPoll: refreshInPlace });

  useEffect(() => {
    if (user && !authLoading && mode !== MODE_FOLLOW_UP) {
      captureEvent('inbox_viewed', { mode });
    }
  }, [user, authLoading, mode]);

  const tourSteps = [
    { title: t('onboarding.tour.welcome'), content: t('onboarding.tour.welcomeContent') },
    { title: t('onboarding.tour.triageTitle'), content: t('onboarding.tour.triageContent') },
    { title: t('onboarding.tour.actionTitle'), content: t('onboarding.tour.actionContent') },
    { title: t('onboarding.tour.deliveryTitle'), content: t('onboarding.tour.deliveryContent') },
  ];

  return { snoozeInput, onboarding, urgentNotification, debugPanel, modals, priorityTooltip, keyboardHint, splitView, tourSteps };
}
