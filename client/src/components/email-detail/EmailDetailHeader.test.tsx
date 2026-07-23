import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Email } from 'types/email';

import { EmailDetailHeader } from './EmailDetailHeader';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) => {
      if (params) {
        return `${key} ${JSON.stringify(params)}`;
      }
      return key;
    },
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('contexts/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'me@example.com' } }),
}));

vi.mock('utils/emailUtils', () => ({
  getCorrespondent: (_email: Email) => ({
    name: _email.fromName || _email.from || '',
    email: _email.from || '',
    timestamp: _email.receivedAt,
  }),
}));

vi.mock('contexts/NotificationContext', () => ({
  useNotifications: () => ({
    showSuccess: vi.fn(),
  }),
}));
const mockWriteText = vi.fn().mockResolvedValue(undefined);
Object.assign(navigator, {
  clipboard: { writeText: mockWriteText },
});

describe('EmailDetailHeader', () => {
  const mockEmail: Email = {
    id: '1',
    threadId: 't1',
    from: 'sender@example.com',
    fromName: 'Sender Name',
    to: 'me@example.com',
    subject: 'Test Subject',
    isRead: true,
    isSnoozed: false,
    receivedAt: '2026-01-15T10:00:00Z',
  };

  const defaultProps = {
    email: mockEmail,
    threadEmails: [] as Email[],
    priorityExplanation: null,
    onFetchPriorityExplanation: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('sender email display', () => {
    it('should display the sender email address', () => {
      render(<EmailDetailHeader {...defaultProps} />);
      expect(screen.getByText(/sender@example\.com/)).toBeInTheDocument();
    });

    it('should display the sender name', () => {
      render(<EmailDetailHeader {...defaultProps} />);
      expect(screen.getByText(/Sender Name/)).toBeInTheDocument();
    });

    it('should show click-to-copy tooltip on the email element', () => {
      render(<EmailDetailHeader {...defaultProps} />);
      const copyButton = screen.getByRole('button', { name: 'emailDetail.clickToCopyEmail' });
      expect(copyButton).toBeInTheDocument();
    });

    it('should not show email span when correspondent has no email', () => {
      const emailWithoutFrom: Email = {
        ...mockEmail,
        from: '',
        fromName: 'No Email Sender',
      };
      render(<EmailDetailHeader {...defaultProps} email={emailWithoutFrom} />);
      expect(screen.queryByRole('button', { name: 'emailDetail.clickToCopyEmail' })).not.toBeInTheDocument();
    });
  });

  describe('click-to-copy', () => {
    it('should copy email to clipboard when clicked', async () => {
      render(<EmailDetailHeader {...defaultProps} />);
      const copyButton = screen.getByRole('button', { name: 'emailDetail.clickToCopyEmail' });
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(mockWriteText).toHaveBeenCalledWith('sender@example.com');
      });
    });

    it('should show copied feedback after clicking', async () => {
      render(<EmailDetailHeader {...defaultProps} />);
      const copyButton = screen.getByRole('button', { name: 'emailDetail.clickToCopyEmail' });
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(screen.getAllByTitle('emailDetail.emailCopied').length).toBeGreaterThan(0);
      });
    });

    it('should revert copied feedback after timeout', async () => {
      render(<EmailDetailHeader {...defaultProps} />);
      const copyButton = screen.getByRole('button', { name: 'emailDetail.clickToCopyEmail' });
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(screen.getAllByTitle('emailDetail.emailCopied').length).toBeGreaterThan(0);
      });

      act(() => {
        vi.advanceTimersByTime(2000);
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'emailDetail.clickToCopyEmail' })).toBeInTheDocument();
      });
    });

    it('should handle clipboard failure gracefully', async () => {
      mockWriteText.mockRejectedValueOnce(new Error('Clipboard denied'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(<EmailDetailHeader {...defaultProps} />);
      const copyButton = screen.getByRole('button', { name: 'emailDetail.clickToCopyEmail' });
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalled();
      });
      consoleSpy.mockRestore();
    });
  });

  describe('priority debug panel', () => {
    it('should always render the priority panel without a click', () => {
      render(<EmailDetailHeader {...defaultProps} />);
      expect(screen.getByTestId('email-detail-priority-panel')).toBeInTheDocument();
    });

    it('should show the resolved score + breakdown without interaction', () => {
      const scoredEmail: Email = { ...mockEmail, priorityScore: 45 };
      const priorityExplanation = {
        score: 45,
        breakdown: [
          { factor: 'Urgency', value: 15, description: 'Deadline mentioned' },
          { factor: 'Goal Alignment', value: 20, description: 'Matches your goals' },
        ],
      };
      render(
        <EmailDetailHeader {...defaultProps} email={scoredEmail} priorityExplanation={priorityExplanation} />
      );
      // Score is shown (t mock echoes key + params)
      expect(screen.getByText(/emailDetail\.priorityScore/)).toBeInTheDocument();
      // Breakdown factors are visible without opening any popover
      expect(screen.getByText('Urgency')).toBeInTheDocument();
      expect(screen.getByText('Goal Alignment')).toBeInTheDocument();
    });

    it('should show "not yet calculated" instead of a misleading 0 when unresolved', () => {
      // mockEmail has no priorityScore and is not processing → unresolved
      render(<EmailDetailHeader {...defaultProps} />);
      expect(screen.getByText('emailDetail.priorityPanel.notCalculated')).toBeInTheDocument();
      expect(screen.queryByText(/priorityScore.*"score":"0"/)).not.toBeInTheDocument();
    });

    it('should retry calculation when the unresolved label is clicked', () => {
      const onFetch = vi.fn();
      render(<EmailDetailHeader {...defaultProps} onFetchPriorityExplanation={onFetch} />);
      fireEvent.click(screen.getByText('emailDetail.priorityPanel.notCalculated'));
      expect(onFetch).toHaveBeenCalled();
    });

    it('should show a calculating state while priority is processing', () => {
      const processingEmail: Email = { ...mockEmail, isProcessingPriority: true };
      render(<EmailDetailHeader {...defaultProps} email={processingEmail} />);
      expect(screen.getByText('emailDetail.priorityPanel.calculating')).toBeInTheDocument();
    });
  });
});
