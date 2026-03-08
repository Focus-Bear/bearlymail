import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { ReplyComposerFooter } from './ReplyComposerFooter';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (params) {
        return `${key} ${JSON.stringify(params)}`;
      }
      return key;
    },
  }),
}));

jest.mock('utils/posthog', () => ({
  captureEvent: jest.fn(),
}));

describe('ReplyComposerFooter', () => {
  const defaultProps = {
    sending: false,
    checkingTone: false,
    draft: 'Test reply content',
    onClose: jest.fn(),
    onSend: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('onSend called with correct expectedReplyHours', () => {
    it('sends 48 (default) when Send is clicked without changing selection', () => {
      render(<ReplyComposerFooter {...defaultProps} />);

      fireEvent.click(screen.getByText('emailDetail.send'));

      expect(defaultProps.onSend).toHaveBeenCalledWith(48, undefined, undefined, false);
    });

    it('sends 0 when "None" is selected', () => {
      render(<ReplyComposerFooter {...defaultProps} />);

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: '0' } });
      fireEvent.click(screen.getByText('emailDetail.send'));

      // Must pass 0 (not undefined) so archive branch is reached
      expect(defaultProps.onSend).toHaveBeenCalledWith(0, undefined, undefined, false);
      expect(defaultProps.onSend).not.toHaveBeenCalledWith(undefined, undefined, undefined, false);
    });

    it('sends 24 when 24h option is selected', () => {
      render(<ReplyComposerFooter {...defaultProps} />);

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: '24' } });
      fireEvent.click(screen.getByText('emailDetail.send'));

      expect(defaultProps.onSend).toHaveBeenCalledWith(24, undefined, undefined, false);
    });

    it('sends 72 when 3d option is selected', () => {
      render(<ReplyComposerFooter {...defaultProps} />);

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: '72' } });
      fireEvent.click(screen.getByText('emailDetail.send'));

      expect(defaultProps.onSend).toHaveBeenCalledWith(72, undefined, undefined, false);
    });

    it('sends 168 when 7d option is selected', () => {
      render(<ReplyComposerFooter {...defaultProps} />);

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: '168' } });
      fireEvent.click(screen.getByText('emailDetail.send'));

      expect(defaultProps.onSend).toHaveBeenCalledWith(168, undefined, undefined, false);
    });
  });

  describe('scheduledSendAt parameter', () => {
    it('sends scheduledSendAt when provided', () => {
      const scheduledTime = new Date('2024-03-01T10:00:00Z');
      render(<ReplyComposerFooter {...defaultProps} scheduledSendAt={scheduledTime} />);

      fireEvent.click(screen.getByText('emailDetail.send'));

      expect(defaultProps.onSend).toHaveBeenCalledWith(48, undefined, scheduledTime, false);
    });

    it('sends undefined for scheduledSendAt when not provided', () => {
      render(<ReplyComposerFooter {...defaultProps} scheduledSendAt={null} />);

      fireEvent.click(screen.getByText('emailDetail.send'));

      expect(defaultProps.onSend).toHaveBeenCalledWith(48, undefined, undefined, false);
    });
  });

  describe('keepInAction checkbox', () => {
    it('sends keepInAction=false by default', () => {
      render(<ReplyComposerFooter {...defaultProps} />);

      fireEvent.click(screen.getByText('emailDetail.send'));

      expect(defaultProps.onSend).toHaveBeenCalledWith(48, undefined, undefined, false);
    });

    it('sends keepInAction=true when checkbox is checked', () => {
      render(<ReplyComposerFooter {...defaultProps} />);

      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);
      fireEvent.click(screen.getByText('emailDetail.send'));

      expect(defaultProps.onSend).toHaveBeenCalledWith(48, undefined, undefined, true);
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
});
