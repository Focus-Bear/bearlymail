import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ThreadItemHeader } from './ThreadItemHeader';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const mockWriteText = jest.fn().mockResolvedValue(undefined);
Object.assign(navigator, {
  clipboard: { writeText: mockWriteText },
});

describe('ThreadItemHeader', () => {
  const defaultProps = {
    from: 'sender@example.com',
    fromName: 'Sender Name',
    receivedAt: '2026-01-15T10:00:00Z',
    isExpanded: false,
    isCurrentEmail: false,
    onToggle: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('sender email display', () => {
    it('should display the sender email when fromName is provided', () => {
      render(<ThreadItemHeader {...defaultProps} />);
      expect(screen.getByText(/sender@example\.com/)).toBeInTheDocument();
    });

    it('should not display email separately when fromName is not provided', () => {
      render(<ThreadItemHeader {...defaultProps} fromName={undefined} />);
      const emailElements = screen.queryAllByText(/sender@example\.com/);
      expect(emailElements).toHaveLength(1);
    });

    it('should show click-to-copy tooltip on the email element', () => {
      render(<ThreadItemHeader {...defaultProps} />);
      const emailSpan = screen.getByTitle('emailDetail.clickToCopyEmail');
      expect(emailSpan).toBeInTheDocument();
    });
  });

  describe('click-to-copy', () => {
    it('should copy email to clipboard when clicked', async () => {
      render(<ThreadItemHeader {...defaultProps} />);
      const emailSpan = screen.getByTitle('emailDetail.clickToCopyEmail');
      fireEvent.click(emailSpan);

      await waitFor(() => {
        expect(mockWriteText).toHaveBeenCalledWith('sender@example.com');
      });
    });

    it('should show copied feedback after clicking', async () => {
      render(<ThreadItemHeader {...defaultProps} />);
      const emailSpan = screen.getByTitle('emailDetail.clickToCopyEmail');
      fireEvent.click(emailSpan);

      await waitFor(() => {
        expect(screen.getByTitle('emailDetail.emailCopied')).toBeInTheDocument();
      });
    });

    it('should revert copied feedback after timeout', async () => {
      render(<ThreadItemHeader {...defaultProps} />);
      const emailSpan = screen.getByTitle('emailDetail.clickToCopyEmail');
      fireEvent.click(emailSpan);

      await waitFor(() => {
        expect(screen.getByTitle('emailDetail.emailCopied')).toBeInTheDocument();
      });

      act(() => {
        jest.advanceTimersByTime(2000);
      });

      await waitFor(() => {
        expect(screen.getByTitle('emailDetail.clickToCopyEmail')).toBeInTheDocument();
      });
    });

    it('should not propagate click to parent toggle', async () => {
      const onToggle = jest.fn();
      render(<ThreadItemHeader {...defaultProps} onToggle={onToggle} />);
      const emailSpan = screen.getByTitle('emailDetail.clickToCopyEmail');
      fireEvent.click(emailSpan);

      await waitFor(() => {
        expect(mockWriteText).toHaveBeenCalled();
      });
      expect(onToggle).not.toHaveBeenCalled();
    });

    it('should handle clipboard failure gracefully', async () => {
      mockWriteText.mockRejectedValueOnce(new Error('Clipboard denied'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      render(<ThreadItemHeader {...defaultProps} />);
      const emailSpan = screen.getByTitle('emailDetail.clickToCopyEmail');
      fireEvent.click(emailSpan);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalled();
      });
      consoleSpy.mockRestore();
    });
  });
});
