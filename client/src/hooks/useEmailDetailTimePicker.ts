import { useCallback, useState } from 'react';

import { TimeSuggestion, useScheduledEmails } from 'hooks/useScheduledEmails';

export interface UseEmailDetailTimePickerResult {
  showTimePicker: boolean;
  setShowTimePicker: (show: boolean) => void;
  scheduledSendAt: Date | null;
  setScheduledSendAt: (date: Date | null) => void;
  timeWarning: string | undefined;
  suggestedTime: Date | undefined;
  timeSuggestions: TimeSuggestion[];
  handleOpenTimePicker: () => void;
  handleTimeSelect: (time: Date) => Promise<void>;
  handleCancelTimePicker: () => void;
}

export const useEmailDetailTimePicker = (): UseEmailDetailTimePickerResult => {
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [scheduledSendAt, setScheduledSendAt] = useState<Date | null>(null);
  const [timeWarning, setTimeWarning] = useState<string | undefined>();
  const [suggestedTime, setSuggestedTime] = useState<Date | undefined>();

  const { timeSuggestions, checkSendTime, fetchTimeSuggestions } = useScheduledEmails();

  const handleOpenTimePicker = useCallback(() => {
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    fetchTimeSuggestions(userTimezone);
    setTimeWarning(undefined);
    setSuggestedTime(undefined);
    setShowTimePicker(true);
  }, [fetchTimeSuggestions]);

  const handleTimeSelect = useCallback(
    async (time: Date) => {
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const checkResult = await checkSendTime(time, userTimezone);
      if (!checkResult.isAppropriate) {
        setTimeWarning(checkResult.warning);
        setSuggestedTime(checkResult.suggestion ? new Date(checkResult.suggestion) : undefined);
      } else {
        setTimeWarning(undefined);
        setSuggestedTime(undefined);
        setScheduledSendAt(time);
        setShowTimePicker(false);
      }
    },
    [checkSendTime]
  );

  const handleCancelTimePicker = useCallback(() => {
    setTimeWarning(undefined);
    setSuggestedTime(undefined);
    setShowTimePicker(false);
  }, []);

  return {
    showTimePicker,
    setShowTimePicker,
    scheduledSendAt,
    setScheduledSendAt,
    timeWarning,
    suggestedTime,
    timeSuggestions,
    handleOpenTimePicker,
    handleTimeSelect,
    handleCancelTimePicker,
  };
};
