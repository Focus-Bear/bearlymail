/**
 * Unit tests for ComposeActions — tone check loading indicator (Issue #881)
 */
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { ComposeActions } from './ComposeActions';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (params) {
        return `${key} ${JSON.stringify(params)}`;
      }
      return key;
    },
  }),
}));

vi.mock('utils/dateUtils', () => ({
  formatScheduledTime: (date: Date) => date.toISOString(),
}));

describe('ComposeActions', () => {
  const defaultProps = {
    sending: false,
    sendSuccess: false,
    checkingTone: false,
    onDiscard: vi.fn(),
    onSend: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('idle state', () => {
    it('renders Send button with default label', () => {
      render(<ComposeActions {...defaultProps} />);
      expect(screen.getByText('compose.send')).toBeInTheDocument();
    });

    it('Send button is enabled when idle', () => {
      render(<ComposeActions {...defaultProps} />);
      expect(screen.getByRole('button', { name: 'compose.send' })).not.toBeDisabled();
    });

    it('calls onSend when Send is clicked', () => {
      render(<ComposeActions {...defaultProps} />);
      fireEvent.click(screen.getByRole('button', { name: 'compose.send' }));
      expect(defaultProps.onSend).toHaveBeenCalledTimes(1);
    });

    it('calls onDiscard when Discard is clicked', () => {
      render(<ComposeActions {...defaultProps} />);
      fireEvent.click(screen.getByText('compose.discard'));
      expect(defaultProps.onDiscard).toHaveBeenCalledTimes(1);
    });
  });

  describe('checkingTone state (Issue #881)', () => {
    it('shows "Checking tone…" label on Send button while checkingTone', () => {
      render(<ComposeActions {...defaultProps} checkingTone />);
      expect(screen.getByText('emailDetail.checkingTone')).toBeInTheDocument();
    });

    it('disables the Send button while checkingTone', () => {
      render(<ComposeActions {...defaultProps} checkingTone />);
      expect(screen.getByRole('button', { name: /emailDetail\.checkingTone/ })).toBeDisabled();
    });

    it('renders a spinner element inside Send button while checkingTone', () => {
      render(<ComposeActions {...defaultProps} checkingTone />);
      const sendButton = screen.getByRole('button', { name: /emailDetail\.checkingTone/ });
      // SPINNER_STYLE renders a <span role="status"> with inline border-based spinner
      expect(within(sendButton).getByRole('status')).toBeInTheDocument();
    });

    it('does not call onSend when Send is clicked while checkingTone', () => {
      render(<ComposeActions {...defaultProps} checkingTone />);
      fireEvent.click(screen.getByRole('button', { name: /emailDetail\.checkingTone/ }));
      expect(defaultProps.onSend).not.toHaveBeenCalled();
    });
  });

  describe('sending state', () => {
    it('shows "Sending…" label on Send button while sending', () => {
      render(<ComposeActions {...defaultProps} sending />);
      expect(screen.getByText('compose.sending')).toBeInTheDocument();
    });

    it('disables Send button while sending', () => {
      render(<ComposeActions {...defaultProps} sending />);
      const sendButton = screen.getByRole('button', { name: 'compose.sending' });
      expect(sendButton).toBeDisabled();
    });
  });

  describe('sendSuccess state', () => {
    it('shows "Sent" label after send success', () => {
      render(<ComposeActions {...defaultProps} sendSuccess />);
      expect(screen.getByText('compose.sent')).toBeInTheDocument();
    });

    it('disables Send button after send success', () => {
      render(<ComposeActions {...defaultProps} sendSuccess />);
      const sendButton = screen.getByRole('button', { name: 'compose.sent' });
      expect(sendButton).toBeDisabled();
    });
  });

  describe('schedule button', () => {
    it('does not render schedule button when onSchedule is not provided', () => {
      render(<ComposeActions {...defaultProps} />);
      expect(screen.queryByText('compose.schedule')).not.toBeInTheDocument();
    });

    it('renders schedule button when onSchedule is provided', () => {
      const onSchedule = vi.fn();
      render(<ComposeActions {...defaultProps} onSchedule={onSchedule} />);
      expect(screen.getByText('compose.schedule')).toBeInTheDocument();
    });

    it('disables schedule button while checkingTone', () => {
      const onSchedule = vi.fn();
      render(<ComposeActions {...defaultProps} checkingTone onSchedule={onSchedule} />);
      const scheduleButton = screen.getByText('compose.schedule');
      expect(scheduleButton).toBeDisabled();
    });
  });

  describe('scheduledSendAt indicator', () => {
    it('renders scheduled time indicator when scheduledSendAt is provided', () => {
      const scheduledTime = new Date('2026-04-10T09:00:00Z');
      render(<ComposeActions {...defaultProps} scheduledSendAt={scheduledTime} />);
      expect(screen.getByText(/compose.scheduledBanner/)).toBeInTheDocument();
    });

    it('does not render indicator when scheduledSendAt is not provided', () => {
      render(<ComposeActions {...defaultProps} />);
      expect(screen.queryByText(/compose.scheduledBanner/)).not.toBeInTheDocument();
    });
  });
});
