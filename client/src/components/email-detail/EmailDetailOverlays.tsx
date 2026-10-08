import React from 'react';

import { TimePicker } from 'components/compose/TimePicker';
import { CustomRuleModal } from 'components/email-detail/CustomRuleModal';
import { TimeSuggestion } from 'hooks/useScheduledEmails';

type CustomRule = { whenToUse: string; howToSummarize: string };

export interface EmailDetailOverlaysProps {
  showRuleModal: boolean;
  customRule: CustomRule;
  onCustomRuleChange: (rule: CustomRule) => void;
  onCloseRuleModal: () => void;
  onCreateCustomRule: () => Promise<void>;
  showTimePicker: boolean;
  scheduledSendAt: Date | null;
  timeSuggestions: TimeSuggestion[];
  timeWarning: string | undefined;
  suggestedTime: Date | undefined;
  onTimeSelect: (time: Date) => void;
  onCancelTimePicker: () => void;
}

/**
 * Modals the email detail opens on top of its content: the custom summary-rule
 * modal and the schedule-send time picker. Every layout (split view, inline
 * drawer, full page) renders this, so an action that opens one of them works
 * wherever the reply composer is shown.
 */
export const EmailDetailOverlays: React.FC<EmailDetailOverlaysProps> = ({
  showRuleModal,
  customRule,
  onCustomRuleChange,
  onCloseRuleModal,
  onCreateCustomRule,
  showTimePicker,
  scheduledSendAt,
  timeSuggestions,
  timeWarning,
  suggestedTime,
  onTimeSelect,
  onCancelTimePicker,
}) => (
  <>
    <CustomRuleModal
      show={showRuleModal}
      customRule={customRule}
      onCustomRuleChange={onCustomRuleChange}
      onClose={onCloseRuleModal}
      onCreate={onCreateCustomRule}
    />
    {showTimePicker && (
      <TimePicker
        selectedTime={scheduledSendAt}
        suggestions={timeSuggestions}
        warning={timeWarning}
        suggestedTime={suggestedTime}
        onTimeSelect={onTimeSelect}
        onCancel={onCancelTimePicker}
      />
    )}
  </>
);
