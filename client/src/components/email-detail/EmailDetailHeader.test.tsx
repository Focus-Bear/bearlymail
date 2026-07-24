import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Email, PriorityExplanation } from 'types/email';

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
  // PriorityTooltipCategory renders a <Trans> for the "Categorised by" line.
  Trans: ({ i18nKey, children }: { i18nKey?: string; children?: React.ReactNode }) => <>{children ?? i18nKey}</>,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  // PriorityTooltipCategory uses useHref to build the "edit rule" deep-link.
  useHref: (to: string) => (typeof to === 'string' ? to : '#'),
}));

vi.mock('contexts/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'me@example.com', isAdmin: false } }),
  AuthContext: React.createContext(null),
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

// usePriorityTooltip fetches the explanation via axios when the popup opens.
const { mockAxiosGet, mockAxiosPost } = vi.hoisted(() => ({
  mockAxiosGet: vi.fn(),
  mockAxiosPost: vi.fn(),
}));
vi.mock('axios', () => ({
  default: { get: mockAxiosGet, post: mockAxiosPost },
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
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockAxiosGet.mockResolvedValue({ data: { score: 45, breakdown: [] } });
    mockAxiosPost.mockResolvedValue({ data: {} });
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

  describe('priority chip (shared inbox-list badge)', () => {
    const scoredEmail: Email = { ...mockEmail, priorityScore: 45, category: 'Sales' };
    const explanation: PriorityExplanation = {
      score: 45,
      breakdown: [
        { factor: 'Urgency', value: 15, description: 'Deadline mentioned' },
        { factor: 'Goal Alignment', value: 20, description: 'Matches your goals' },
      ],
    };

    it('should render the priority chip with the resolved score', () => {
      render(<EmailDetailHeader {...defaultProps} email={scoredEmail} priorityExplanation={explanation} />);
      // getPriorityBadge label key + numeric score (t mock echoes the key)
      expect(screen.getByText(/priority\.\w+ \(45\)/)).toBeInTheDocument();
    });

    it('should show "not prioritised" instead of a 0 when the score is unresolved', () => {
      // mockEmail has no priorityScore and is not processing → unresolved
      render(<EmailDetailHeader {...defaultProps} />);
      expect(screen.getByText('email.priorityUnavailable')).toBeInTheDocument();
      expect(screen.queryByText(/\(0\)/)).not.toBeInTheDocument();
    });

    it('should show a calculating state while priority is processing', () => {
      const processingEmail: Email = { ...mockEmail, isProcessingPriority: true };
      render(<EmailDetailHeader {...defaultProps} email={processingEmail} />);
      expect(screen.getByText(/email\.calculating/)).toBeInTheDocument();
    });

    it('should open the shared priority popup (with breakdown) when the chip is clicked', async () => {
      render(<EmailDetailHeader {...defaultProps} email={scoredEmail} priorityExplanation={explanation} />);
      const chip = document.querySelector(`[data-priority-badge="${scoredEmail.id}"]`) as HTMLElement;
      expect(chip).toBeTruthy();

      fireEvent.click(chip);

      // The shared PriorityTooltip renders into a portal on document.body.
      await waitFor(() => {
        expect(document.querySelector(`[data-priority-tooltip="${scoredEmail.id}"]`)).toBeTruthy();
      });
      // Auto-loaded explanation means the breakdown shows immediately (no spinner).
      expect(screen.getByText('Urgency')).toBeInTheDocument();
      expect(screen.getByText('Goal Alignment')).toBeInTheDocument();
    });
  });
});
