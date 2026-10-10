import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { FeedbackModal } from './FeedbackModal';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('contexts/NotificationContext', () => ({
  useNotifications: () => ({ showError: vi.fn() }),
}));

vi.mock('axios', () => ({ default: { post: vi.fn() } }));

describe('FeedbackModal — guard against discarding typed feedback', () => {
  let confirmSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    confirmSpy = vi.spyOn(window, 'confirm');
  });

  afterEach(() => {
    confirmSpy.mockRestore();
    localStorage.clear();
  });

  const typeMessage = (text: string) => {
    fireEvent.change(screen.getByRole('textbox'), { target: { value: text } });
  };

  // Cancel is now the single close control (the redundant top-right X was removed).
  const clickClose = () => {
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));
  };

  it('closes immediately (no confirm) when no text has been entered', () => {
    const onClose = vi.fn();
    render(<FeedbackModal onClose={onClose} />);

    clickClose();

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('confirms before discarding, and keeps the modal open if the user cancels', () => {
    confirmSpy.mockReturnValue(false);
    const onClose = vi.fn();
    render(<FeedbackModal onClose={onClose} />);

    typeMessage('a detailed bug report I spent time on');
    clickClose();

    expect(confirmSpy).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes when the user confirms discarding the typed feedback', () => {
    confirmSpy.mockReturnValue(true);
    const onClose = vi.fn();
    render(<FeedbackModal onClose={onClose} />);

    typeMessage('a detailed bug report I spent time on');
    clickClose();

    expect(confirmSpy).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});

const DRAFT_KEY = 'bearlymail.feedbackDraft';

describe('FeedbackModal — draft persistence', () => {
  let confirmSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    confirmSpy = vi.spyOn(window, 'confirm');
  });

  afterEach(() => {
    confirmSpy.mockRestore();
    localStorage.clear();
  });

  it('restores a saved draft when the modal reopens', () => {
    localStorage.setItem(DRAFT_KEY, 'draft from last time');
    render(<FeedbackModal onClose={vi.fn()} />);

    expect(screen.getByRole('textbox')).toHaveValue('draft from last time');
  });

  it('persists typed text to localStorage (survives accidental close/refresh)', () => {
    render(<FeedbackModal onClose={vi.fn()} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'in-progress report' } });

    expect(localStorage.getItem(DRAFT_KEY)).toBe('in-progress report');
  });

  it('clears the saved draft when the user confirms discarding', () => {
    confirmSpy.mockReturnValue(true);
    render(<FeedbackModal onClose={vi.fn()} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'throwaway' } });
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));

    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });
});
