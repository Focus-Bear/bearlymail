import { useCallback, useEffect, useRef, useState } from 'react';
import { InboxMode } from 'types/email';
import { captureEvent } from 'utils/posthog';

import { ANALYTICS_EVENTS } from 'constants/analytics-events';
import { MODE_TRIAGE } from 'constants/strings';
import { EmailDetailRef } from 'pages/EmailDetail';

interface UseSplitViewPanelStateParams {
  selectedEmailId: string;
  selectedEmail: { subject?: string; from?: string; fromName?: string; starCount?: number } | undefined;
  mode?: InboxMode;
  onPrioritySet?: (emailId: string, starCount: number) => void;
}

interface UseSplitViewPanelStateResult {
  emailDetailComponentRef: React.MutableRefObject<EmailDetailRef | null>;
  starCount: number;
  correspondentName: string;
  showSnoozeInput: boolean;
  snoozeValue: string;
  setSnoozeValue: (value: string) => void;
  handleCorrespondentChange: (correspondent: { name: string; email: string }) => void;
  handleReplyClick: () => void;
  handleForwardClick: () => void;
  handleArchiveClick: () => void;
  handleSetStarCountForSlider: (emailId: string, newCount: number) => Promise<void>;
  handleSnoozeClick: () => void;
  handleSnoozeConfirm: () => void;
  handleSnoozeCancel: () => void;
}

export function useSplitViewPanelState({
  selectedEmailId,
  selectedEmail,
  mode,
  onPrioritySet,
}: UseSplitViewPanelStateParams): UseSplitViewPanelStateResult {
  const emailDetailComponentRef = useRef<EmailDetailRef | null>(null);
  const [starCount, setStarCount] = useState<number>(selectedEmail?.starCount ?? 0);
  const [correspondentName, setCorrespondentName] = useState<string>('');
  const [showSnoozeInput, setShowSnoozeInput] = useState(false);
  const [snoozeValue, setSnoozeValue] = useState('');

  const handleCorrespondentChange = useCallback((correspondent: { name: string; email: string }) => {
    setCorrespondentName(correspondent.name);
  }, []);

  useEffect(() => {
    setStarCount(selectedEmail?.starCount ?? 0);
    setCorrespondentName('');
  }, [selectedEmailId, selectedEmail]);

  const handleReplyClick = () => {
    emailDetailComponentRef.current?.openReplyComposer('replyAll');
  };
  const handleForwardClick = () => {
    emailDetailComponentRef.current?.openReplyComposer('forward');
  };
  const handleArchiveClick = () => {
    emailDetailComponentRef.current?.archive();
  };

  const handleSetStarCountForSlider = useCallback(
    async (_emailId: string, newCount: number): Promise<void> => {
      if (mode === MODE_TRIAGE && newCount > 0 && onPrioritySet) {
        onPrioritySet(selectedEmailId, newCount);
        return;
      }
      setStarCount(newCount);
      emailDetailComponentRef.current?.setStarCount(newCount);
    },
    [mode, onPrioritySet, selectedEmailId, emailDetailComponentRef]
  );

  const handleSnoozeClick = () => {
    captureEvent(ANALYTICS_EVENTS.EMAIL_SNOOZE_CLICKED, { email_id: selectedEmailId });
    setShowSnoozeInput(prev => !prev);
  };
  const handleSnoozeConfirm = () => {
    if (snoozeValue.trim()) {
      emailDetailComponentRef.current?.snooze(snoozeValue);
      setShowSnoozeInput(false);
      setSnoozeValue('');
    }
  };
  const handleSnoozeCancel = () => {
    setShowSnoozeInput(false);
    setSnoozeValue('');
  };

  return {
    emailDetailComponentRef,
    starCount,
    correspondentName,
    showSnoozeInput,
    snoozeValue,
    setSnoozeValue,
    handleCorrespondentChange,
    handleReplyClick,
    handleForwardClick,
    handleArchiveClick,
    handleSetStarCountForSlider,
    handleSnoozeClick,
    handleSnoozeConfirm,
    handleSnoozeCancel,
  };
}
