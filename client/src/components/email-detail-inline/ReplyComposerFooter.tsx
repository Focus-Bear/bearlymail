import React from 'react';
import { theme } from 'theme/theme';

import { ActionCheckboxRow } from './ActionCheckboxRow';
import { ButtonRow } from './ButtonRow';
import { ExpectedReplyRow } from './ExpectedReplyRow';
import { ScheduledTimeBanner } from './ScheduledTimeBanner';
import { ReplyComposerFooterProps, useReplyComposerFooter } from './useReplyComposerFooter';

export { getScheduleSuggestions } from './scheduleUtils';

/**
 * Footer for the reply composer: scheduled-time banner, expected-reply selector,
 * keep-in-action checkbox, and cancel/send/schedule buttons.
 */
export const ReplyComposerFooter: React.FC<ReplyComposerFooterProps> = props => {
  const { onClose, onClearSchedule, scheduledSendAt, sending, checkingTone } = props;
  const hook = useReplyComposerFooter(props);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.md, marginTop: theme.spacing.md }}>
      {scheduledSendAt && <ScheduledTimeBanner scheduledSendAt={scheduledSendAt} onClearSchedule={onClearSchedule} />}

      <ExpectedReplyRow
        followUpDuration={hook.followUpDuration}
        sending={sending}
        checkingTone={checkingTone}
        tooltipText={hook.expectedReplyTooltip}
        onChange={hook.setFollowUpDuration}
      />

      <ActionCheckboxRow
        keepInAction={hook.keepInAction}
        sending={sending}
        checkingTone={checkingTone}
        onChange={event => hook.setKeepInAction(event.target.checked)}
      />

      <ButtonRow
        isDisabled={hook.isDisabled}
        sending={sending}
        checkingTone={checkingTone}
        showSchedulePopup={hook.showSchedulePopup}
        buttonText={hook.getButtonText()}
        toneCheckFailed={props.toneCheckFailed}
        onClose={onClose}
        onSend={hook.handleSend}
        onSendAnyway={hook.handleSendAnyway}
        onScheduleIconClick={hook.handleScheduleIconClick}
        onSelectSuggestion={hook.handleSelectSuggestion}
        onPickCustom={hook.handlePickCustom}
        onCloseSchedulePopup={() => hook.setShowSchedulePopup(false)}
      />
    </div>
  );
};
