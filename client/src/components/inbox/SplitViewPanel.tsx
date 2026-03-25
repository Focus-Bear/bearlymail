import React, { RefObject } from 'react';
import { InboxMode } from 'types/email';

import { MODE_ACTION } from 'constants/strings';
import EmailDetail from 'pages/EmailDetail';

import { SplitViewPanelShell } from './SplitViewPanelShell';
import { useSplitViewPanelState } from './useSplitViewPanelState';

interface SelectedEmail {
  subject: string;
  from: string;
  fromName?: string;
}

interface SplitViewPanelProps {
  selectedEmailId: string;
  selectedEmail?: SelectedEmail;
  panelExpanded: boolean;
  splitPosition: number;
  isResizing: boolean;
  emailDetailRef: RefObject<HTMLDivElement | null>;
  onTogglePanel: () => void;
  onClose: () => void;
  onArchiveComplete?: (emailId: string) => void;
  onSnoozeComplete?: (emailId: string) => void;
  onPrioritySet?: (emailId: string, starCount: number) => void;
  mode?: InboxMode;
}

/**
 * Container component: manages all state via useSplitViewPanelState and
 * renders SplitViewPanelShell with EmailDetail injected as children.
 *
 * To render in Storybook, use SplitViewPanelShell directly with a mock children slot.
 */
export const SplitViewPanel: React.FC<SplitViewPanelProps> = ({
  selectedEmailId,
  selectedEmail,
  panelExpanded,
  splitPosition,
  isResizing,
  emailDetailRef,
  onTogglePanel: _onTogglePanel,
  onClose,
  onArchiveComplete,
  onSnoozeComplete,
  onPrioritySet,
  mode,
}) => {
  const {
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
  } = useSplitViewPanelState({ selectedEmailId, selectedEmail, mode, onPrioritySet });

  const senderName = correspondentName || selectedEmail?.fromName || selectedEmail?.from || '';
  const subject = selectedEmail?.subject || '';

  return (
    <SplitViewPanelShell
      selectedEmailId={selectedEmailId}
      selectedEmail={selectedEmail}
      panelExpanded={panelExpanded}
      splitPosition={splitPosition}
      isResizing={isResizing}
      emailDetailRef={emailDetailRef}
      senderName={senderName}
      subject={subject}
      starCount={starCount}
      showSnoozeInput={showSnoozeInput}
      snoozeValue={snoozeValue}
      onReply={handleReplyClick}
      onForward={handleForwardClick}
      onArchive={handleArchiveClick}
      onSnoozeClick={handleSnoozeClick}
      onSnoozeValueChange={setSnoozeValue}
      onSnoozeConfirm={handleSnoozeConfirm}
      onSnoozeCancel={handleSnoozeCancel}
      onClose={onClose}
      onOpenInNewTab={() => window.open(`/email/${selectedEmailId}`, '_blank')}
      onSetStarCount={handleSetStarCountForSlider}
    >
      <EmailDetail
        key={selectedEmailId}
        ref={emailDetailComponentRef}
        emailId={selectedEmailId}
        compactMode
        onArchiveComplete={onArchiveComplete}
        onSnoozeComplete={onSnoozeComplete}
        autoGenerateReplies={mode === MODE_ACTION}
        onCorrespondentChange={handleCorrespondentChange}
      />
    </SplitViewPanelShell>
  );
};
