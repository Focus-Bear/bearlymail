import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';

import { getScheduleSuggestions, ReplyComposerFooter } from './ReplyComposerFooter';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (params) {
        return `${key} ${JSON.stringify(params)}`;
      }
      return key;
    },
    i18n: { language: 'en' },
  }),
}));

vi.mock('utils/posthog', () => ({
  captureEvent: vi.fn(),
}));

vi.mock('react-icons/fi', () => ({
  FiCalendar: () => <svg data-testid="icon-calendar" />,
  FiInfo: () => <svg data-testid="icon-info" />,
}));

describe('ReplyComposerFooter', () => {
  const defaultProps = {
    sending: false,
    checkingTone: false,
    draft: 'Test reply content',
    onClose: vi.fn(),
    onSend: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('follow-up duration input', () => {
    const getInput = () => screen.getByPlaceholderText('emailDetail.expectedReply.customPlaceholder');

    // On Fridays the quick-options array drops "3d" and replaces "48h" with
    // "next Monday", which shifts the indices these tests rely on. Pin to a
    // non-Friday so the buttons are always [48h, 3d, 7d, 2w].
    beforeEach(() => {
      vi.spyOn(Date.prototype, 'getDay').mockReturnValue(1); // Monday
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('renders a free-text input pre-filled with the default duration (no dropdown)', () => {
      render(<ReplyComposerFooter {...defaultProps} />);

      expect(getInput()).toHaveValue('48h');
      expect(screen.queryByRole('combobox')).toBeNull();
    });

    it('sends the default duration string when Send is clicked unchanged', () => {
      render(<ReplyComposerFooter {...defaultProps} />);

      fireEvent.click(screen.getByText('emailDetail.send'));

      expect(defaultProps.onSend).toHaveBeenCalledWith(undefined, undefined, undefined, false, '48h');
    });

    it('sends a typed natural-language duration string', () => {
      render(<ReplyComposerFooter {...defaultProps} />);

      fireEvent.change(getInput(), { target: { value: 'next Monday' } });
      fireEvent.click(screen.getByText('emailDetail.send'));

      expect(defaultProps.onSend).toHaveBeenCalledWith(undefined, undefined, undefined, false, 'next Monday');
    });

    it('trims the typed duration before sending', () => {
      render(<ReplyComposerFooter {...defaultProps} />);

      fireEvent.change(getInput(), { target: { value: '  3d  ' } });
      fireEvent.click(screen.getByText('emailDetail.send'));

      expect(defaultProps.onSend).toHaveBeenCalledWith(undefined, undefined, undefined, false, '3d');
    });

    it('sends 0 hours (no follow-up) when the input is cleared', () => {
      render(<ReplyComposerFooter {...defaultProps} />);

      fireEvent.change(getInput(), { target: { value: '' } });
      fireEvent.click(screen.getByText('emailDetail.send'));

      // Must pass 0 (not a duration) so the archive branch is reached.
      expect(defaultProps.onSend).toHaveBeenCalledWith(0, undefined, undefined, false);
    });

    it('treats a whitespace-only value as no follow-up', () => {
      render(<ReplyComposerFooter {...defaultProps} />);

      fireEvent.change(getInput(), { target: { value: '   ' } });
      fireEvent.click(screen.getByText('emailDetail.send'));

      expect(defaultProps.onSend).toHaveBeenCalledWith(0, undefined, undefined, false);
    });

    it('renders a clear button when the input has a value', () => {
      render(<ReplyComposerFooter {...defaultProps} />);

      // Default value is '48h' so the clear button should be visible
      expect(screen.getByLabelText('emailDetail.expectedReply.clear')).toBeInTheDocument();
    });

    it('does not render a clear button when the input is empty', () => {
      render(<ReplyComposerFooter {...defaultProps} />);

      fireEvent.change(getInput(), { target: { value: '' } });

      expect(screen.queryByLabelText('emailDetail.expectedReply.clear')).not.toBeInTheDocument();
    });

    it('clears the input when the X button is clicked', () => {
      render(<ReplyComposerFooter {...defaultProps} />);

      fireEvent.click(screen.getByLabelText('emailDetail.expectedReply.clear'));

      expect(getInput()).toHaveValue('');
    });

    it('sends no follow-up after clicking the X button', () => {
      render(<ReplyComposerFooter {...defaultProps} />);

      fireEvent.click(screen.getByLabelText('emailDetail.expectedReply.clear'));
      fireEvent.click(screen.getByText('emailDetail.send'));

      expect(defaultProps.onSend).toHaveBeenCalledWith(0, undefined, undefined, false);
    });

    it('does not show quick option buttons when input is not focused', () => {
      render(<ReplyComposerFooter {...defaultProps} />);

      expect(screen.queryByTestId('follow-up-quick-options')).not.toBeInTheDocument();
    });

    it('shows quick option buttons when input is focused', () => {
      render(<ReplyComposerFooter {...defaultProps} />);

      const input = screen.getByPlaceholderText('emailDetail.expectedReply.customPlaceholder');
      fireEvent.focus(input);

      expect(screen.getByTestId('follow-up-quick-options')).toBeInTheDocument();
    });

    it('hides quick option buttons when input loses focus', () => {
      render(<ReplyComposerFooter {...defaultProps} />);

      const input = screen.getByPlaceholderText('emailDetail.expectedReply.customPlaceholder');
      fireEvent.focus(input);
      fireEvent.blur(input);

      expect(screen.queryByTestId('follow-up-quick-options')).not.toBeInTheDocument();
    });

    it('sets input value when a quick option is selected', () => {
      render(<ReplyComposerFooter {...defaultProps} />);

      const input = screen.getByPlaceholderText('emailDetail.expectedReply.customPlaceholder');
      fireEvent.focus(input);

      // Select by label, not position: the quick-option set is date-dependent
      // (on Fridays "48h"→"next Monday" and "3d" is dropped), so indices shift.
      // "7d" is present every day.
      const quickOptions = screen.getByTestId('follow-up-quick-options');
      fireEvent.mouseDown(
        within(quickOptions).getByText('emailDetail.expectedReply.quick7d'),
      );

      expect(input).toHaveValue('7d');
    });

    it('hides quick options after selecting one', () => {
      render(<ReplyComposerFooter {...defaultProps} />);

      const input = screen.getByPlaceholderText('emailDetail.expectedReply.customPlaceholder');
      fireEvent.focus(input);

      const quickOptions = screen.getByTestId('follow-up-quick-options');
      const optionButtons = within(quickOptions).getAllByRole('button');
      fireEvent.mouseDown(optionButtons[0]); // "48h"

      expect(screen.queryByTestId('follow-up-quick-options')).not.toBeInTheDocument();
    });

    it('sends the selected quick option duration when Send is clicked', () => {
      render(<ReplyComposerFooter {...defaultProps} />);

      const input = screen.getByPlaceholderText('emailDetail.expectedReply.customPlaceholder');
      fireEvent.focus(input);
      // Select "7d" by label — present every day (see note above).
      const quickOptions = screen.getByTestId('follow-up-quick-options');
      fireEvent.mouseDown(
        within(quickOptions).getByText('emailDetail.expectedReply.quick7d'),
      );
      fireEvent.blur(input);

      fireEvent.click(screen.getByText('emailDetail.send'));

      expect(defaultProps.onSend).toHaveBeenCalledWith(undefined, undefined, undefined, false, '7d');
    });

    it('does not show quick options when disabled (sending)', () => {
      render(<ReplyComposerFooter {...defaultProps} sending />);

      const input = screen.getByPlaceholderText('emailDetail.expectedReply.customPlaceholder');
      fireEvent.focus(input);

      expect(screen.queryByTestId('follow-up-quick-options')).not.toBeInTheDocument();
    });
  });

  describe('scheduledSendAt parameter', () => {
    it('sends scheduledSendAt when provided', () => {
      const scheduledTime = new Date('2024-03-01T10:00:00Z');
      render(<ReplyComposerFooter {...defaultProps} scheduledSendAt={scheduledTime} />);

      fireEvent.click(screen.getByText('emailDetail.send'));

      expect(defaultProps.onSend).toHaveBeenCalledWith(undefined, undefined, scheduledTime, false, '48h');
    });

    it('sends undefined for scheduledSendAt when not provided', () => {
      render(<ReplyComposerFooter {...defaultProps} scheduledSendAt={null} />);

      fireEvent.click(screen.getByText('emailDetail.send'));

      expect(defaultProps.onSend).toHaveBeenCalledWith(undefined, undefined, undefined, false, '48h');
    });
  });

  describe('keepInAction checkbox', () => {
    it('sends keepInAction=false by default', () => {
      render(<ReplyComposerFooter {...defaultProps} />);

      fireEvent.click(screen.getByText('emailDetail.send'));

      expect(defaultProps.onSend).toHaveBeenCalledWith(undefined, undefined, undefined, false, '48h');
    });

    it('sends keepInAction=true when checkbox is checked', () => {
      render(<ReplyComposerFooter {...defaultProps} />);

      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);
      fireEvent.click(screen.getByText('emailDetail.send'));

      expect(defaultProps.onSend).toHaveBeenCalledWith(undefined, undefined, undefined, true, '48h');
    });

    it('renders "I still need to take action" label via i18n key', () => {
      render(<ReplyComposerFooter {...defaultProps} />);
      // The mock returns the i18n key as text
      expect(screen.getByText('emailDetail.keepInAction')).toBeInTheDocument();
    });
  });

  describe('disabled state', () => {
    it('disables Send button when draft is empty', () => {
      render(<ReplyComposerFooter {...defaultProps} draft={null} />);

      const sendButton = screen.getByText('emailDetail.send');
      expect(sendButton).toBeDisabled();
    });

    it('disables Send button while sending', () => {
      render(<ReplyComposerFooter {...defaultProps} sending />);

      // Send button shows "sending" text when sending
      const sendButton = screen.getByText('emailDetail.sending');
      expect(sendButton).toBeDisabled();
    });

    it('shows "Checking tone…" label and disables Send button while checkingTone', () => {
      render(<ReplyComposerFooter {...defaultProps} checkingTone />);

      // Button text changes to the checkingTone i18n key
      const sendButton = screen.getByText('emailDetail.checkingTone');
      expect(sendButton).toBeDisabled();
    });

    it('renders InlineSpinner inside Send button while checkingTone', () => {
      render(<ReplyComposerFooter {...defaultProps} checkingTone />);

      // InlineSpinner renders with data-testid="inline-spinner" inside the button
      const sendButton = screen.getByRole('button', { name: /emailDetail\.checkingTone/ });
      const spinner = within(sendButton).getByTestId('inline-spinner');
      expect(spinner).toBeInTheDocument();
    });

    it('disables Cancel button while checkingTone', () => {
      render(<ReplyComposerFooter {...defaultProps} checkingTone />);

      const cancelButton = screen.getByText('common.cancel');
      expect(cancelButton).toBeDisabled();
    });

    it('does not fire onSend when disabled', () => {
      render(<ReplyComposerFooter {...defaultProps} draft={null} />);

      fireEvent.click(screen.getByText('emailDetail.send'));

      expect(defaultProps.onSend).not.toHaveBeenCalled();
    });
  });

  describe('cancel button', () => {
    it('calls onClose when Cancel is clicked', () => {
      render(<ReplyComposerFooter {...defaultProps} />);

      fireEvent.click(screen.getByText('common.cancel'));

      expect(defaultProps.onClose).toHaveBeenCalled();
    });
  });

  describe('info tooltips', () => {
    it('renders info tooltip triggers for expected reply and keepInAction', () => {
      render(<ReplyComposerFooter {...defaultProps} />);
      const triggers = screen.getAllByTestId('info-tooltip-trigger');
      // Two triggers: one for expected reply, one for keepInAction
      expect(triggers).toHaveLength(2);
    });

    it('shows expected reply tooltip on hover', () => {
      render(<ReplyComposerFooter {...defaultProps} />);
      const triggers = screen.getAllByTestId('info-tooltip-trigger');
      fireEvent.mouseEnter(triggers[0]);
      expect(screen.getByRole('tooltip')).toBeInTheDocument();
    });

    it('shows keepInAction tooltip on hover', () => {
      render(<ReplyComposerFooter {...defaultProps} />);
      const triggers = screen.getAllByTestId('info-tooltip-trigger');
      fireEvent.mouseEnter(triggers[1]);
      expect(screen.getByRole('tooltip')).toBeInTheDocument();
    });

    it('hides tooltip on mouse leave after delay', () => {
      vi.useFakeTimers();
      render(<ReplyComposerFooter {...defaultProps} />);
      const triggers = screen.getAllByTestId('info-tooltip-trigger');
      fireEvent.mouseEnter(triggers[0]);
      expect(screen.getByRole('tooltip')).toBeInTheDocument();
      fireEvent.mouseLeave(triggers[0]);
      act(() => {
        vi.runAllTimers();
      });
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
      vi.useRealTimers();
    });
  });

  describe('schedule button', () => {
    it('renders FiCalendar icon when onSchedule is provided', () => {
      const onSchedule = vi.fn();
      render(<ReplyComposerFooter {...defaultProps} onSchedule={onSchedule} />);
      expect(screen.getByTestId('icon-calendar')).toBeInTheDocument();
    });

    it('opens schedule popup when schedule button is clicked', () => {
      const onSchedule = vi.fn();
      render(<ReplyComposerFooter {...defaultProps} onSchedule={onSchedule} />);
      fireEvent.click(screen.getByLabelText('emailDetail.schedule'));
      // Popup should appear
      expect(screen.getByTestId('schedule-popup')).toBeInTheDocument();
      // onSchedule should NOT be called yet (only called for custom picker)
      expect(onSchedule).not.toHaveBeenCalled();
    });

    it('calls onSchedule when "Pick date & time..." is clicked in popup', () => {
      const onSchedule = vi.fn();
      render(<ReplyComposerFooter {...defaultProps} onSchedule={onSchedule} />);
      fireEvent.click(screen.getByLabelText('emailDetail.schedule'));
      fireEvent.click(screen.getByText('emailDetail.schedulePopup.pickDateTime'));
      expect(onSchedule).toHaveBeenCalledTimes(1);
    });

    it('calls onSend with a date when a suggestion is clicked', () => {
      const onSchedule = vi.fn();
      render(<ReplyComposerFooter {...defaultProps} onSchedule={onSchedule} />);
      fireEvent.click(screen.getByLabelText('emailDetail.schedule'));
      // Click first suggestion button (there will be at least one)
      const popup = screen.getByTestId('schedule-popup');
      const allButtons = within(popup).getAllByRole('button');
      const suggestionButtons = allButtons.slice(0, -1);
      fireEvent.click(suggestionButtons[0]);
      // onSend should be called with a Date (and the default follow-up duration)
      expect(defaultProps.onSend).toHaveBeenCalledWith(undefined, undefined, expect.any(Date), false, '48h');
    });

    it('closes popup when Escape is pressed', () => {
      const onSchedule = vi.fn();
      render(<ReplyComposerFooter {...defaultProps} onSchedule={onSchedule} />);
      fireEvent.click(screen.getByLabelText('emailDetail.schedule'));
      expect(screen.getByTestId('schedule-popup')).toBeInTheDocument();
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByTestId('schedule-popup')).not.toBeInTheDocument();
    });

    it('always renders schedule button even when onSchedule is not provided', () => {
      // Schedule button is always visible — clicking is a no-op when onSchedule is absent
      render(<ReplyComposerFooter {...defaultProps} />);
      expect(screen.getByTestId('icon-calendar')).toBeInTheDocument();
    });
  });

  describe('getScheduleSuggestions', () => {
    it('returns Monday morning suggestion on a Saturday', () => {
      // Saturday = dow 6
      const saturday = new Date('2026-03-07T10:00:00'); // Saturday
      const suggestions = getScheduleSuggestions(saturday);
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].labelKey).toBe('mondayMorning');
    });

    it('returns tomorrow morning on late evening weekday', () => {
      const eveningMonday = new Date('2026-03-09T20:00:00'); // Monday evening
      const suggestions = getScheduleSuggestions(eveningMonday);
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].labelKey).toBe('tomorrowMorning');
    });

    it('returns this afternoon + tomorrow morning on weekday morning', () => {
      const mondayMorning = new Date('2026-03-09T09:00:00'); // Monday morning
      const suggestions = getScheduleSuggestions(mondayMorning);
      expect(suggestions).toHaveLength(2);
      expect(suggestions[0].labelKey).toBe('thisAfternoon');
      expect(suggestions[1].labelKey).toBe('tomorrowMorning');
    });

    it('returns tomorrow morning on weekday afternoon', () => {
      const mondayAfternoon = new Date('2026-03-09T15:00:00'); // Monday afternoon
      const suggestions = getScheduleSuggestions(mondayAfternoon);
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].labelKey).toBe('tomorrowMorning');
    });
  });

  describe('expected reply label', () => {
    it('renders "Expect a reply within" label via i18n key', () => {
      render(<ReplyComposerFooter {...defaultProps} />);
      expect(screen.getByText('emailDetail.expectedReply.label')).toBeInTheDocument();
    });
  });
});
