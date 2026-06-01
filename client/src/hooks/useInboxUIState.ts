import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Email, InboxMode } from 'types/email';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { MODE_FOLLOW_UP } from 'constants/strings';
import { User } from 'contexts/AuthContext';
import { useDebugPanel } from 'hooks/useDebugPanel';
import { useEmailProcessingPolling } from 'hooks/useEmailProcessingPolling';
import { useGitHubBatchFetch } from 'hooks/useGitHubBatchFetch';
import { useKeyboardHint } from 'hooks/useKeyboardHint';
import { useModals } from 'hooks/useModals';
import { useOnboarding } from 'hooks/useOnboarding';
import { usePriorityTooltip } from 'hooks/usePriorityTooltip';
import { useSnoozeInput } from 'hooks/useSnoozeInput';
import { useSplitView } from 'hooks/useSplitView';
import { useUrgentNotification } from 'hooks/useUrgentNotification';

interface UIStateParams {
  user: User | null;
  authLoading: boolean;
  refreshUser: () => Promise<void>;
  fetchEmails: () => void;
  refreshInPlace: () => Promise<void>;
  mode: InboxMode;
  emails: Email[];
  loading: boolean;
}

/**
 * Packages all "UI peripheral" hooks for the inbox - modals, panels, notifications, split view.
 * Also includes background polling and the inbox-viewed tracking effect.
 * Extracted from useInboxState to reduce its statement count.
 */
export function useInboxUIState({
  user,
  authLoading,
  refreshUser,
  fetchEmails,
  refreshInPlace,
  mode,
  emails,
  loading,
}: UIStateParams) {
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
      captureEvent(ANALYTICS_EVENTS.INBOX_VIEWED, { mode });
    }
  }, [user, authLoading, mode]);

  const tourSteps = [
    { title: t('onboarding.tour.welcome'), content: t('onboarding.tour.welcomeContent') },
    { title: t('onboarding.tour.triageTitle'), content: t('onboarding.tour.triageContent') },
    { title: t('onboarding.tour.actionTitle'), content: t('onboarding.tour.actionContent') },
    { title: t('onboarding.tour.deliveryTitle'), content: t('onboarding.tour.deliveryContent') },
    { title: t('onboarding.tour.assistantTitle'), content: t('onboarding.tour.assistantContent') },
  ];

  return {
    snoozeInput,
    onboarding,
    urgentNotification,
    debugPanel,
    modals,
    priorityTooltip,
    keyboardHint,
    splitView,
    tourSteps,
  };
}
