import { act, renderHook, waitFor } from '@testing-library/react';

import {
  ACTION_MOVE_GHOST_TEST_ID,
  ACTION_MOVE_TOAST_DURATION_MS,
  ACTION_TAB_EMPHASIS,
  FIRST_PRIORITISE_SEEN_STORAGE_KEY_PREFIX,
} from 'constants/actionMove';

import { useActionMoveFeedback } from './useActionMoveFeedback';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const USER_ID = 'user-1';
const OTHER_USER_ID = 'user-2';
const EMAIL_ID = 'email-1';

function mockReducedMotion(prefersReducedMotion: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: prefersReducedMotion && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

function mountRowAndTab() {
  const row = document.createElement('div');
  row.dataset.emailId = EMAIL_ID;
  const tab = document.createElement('button');
  document.body.append(row, tab);
  return { tab };
}

const animate = vi.fn(() => ({ finished: Promise.resolve() }));

function renderFeedback(userId: string, isActionTabActive = false) {
  const { tab } = mountRowAndTab();
  const onViewActionTab = vi.fn();
  const hook = renderHook(
    ({ active }: { active: boolean }) =>
      useActionMoveFeedback({ userId, isActionTabActive: active, actionTabRef: { current: tab }, onViewActionTab }),
    { initialProps: { active: isActionTabActive } }
  );
  return { ...hook, onViewActionTab };
}

describe('useActionMoveFeedback', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    animate.mockClear();
    HTMLElement.prototype.animate = animate as unknown as HTMLElement['animate'];
    mockReducedMotion(false);
  });

  describe('once-only first-prioritise celebration', () => {
    it('celebrates the first prioritisation loudly and remembers it for the user', async () => {
      const { result } = renderFeedback(USER_ID);

      act(() => result.current.onEmailPrioritised(EMAIL_ID, 'Quarterly report'));

      expect(result.current.isToastVisible).toBe(true);
      expect(result.current.announcement).toBe('inbox.actionMove.announcementFirst');
      expect(localStorage.getItem(`${FIRST_PRIORITISE_SEEN_STORAGE_KEY_PREFIX}${USER_ID}`)).not.toBeNull();
      await waitFor(() => expect(result.current.tabEmphasis).toBe(ACTION_TAB_EMPHASIS.FIRST_TIME));
      expect(result.current.movedCount).toBe(1);
    });

    it('uses the subtle version for every later prioritisation, even after a reload', async () => {
      const first = renderFeedback(USER_ID);
      act(() => first.result.current.onEmailPrioritised(EMAIL_ID));
      first.unmount();

      const { result } = renderFeedback(USER_ID);
      act(() => result.current.onEmailPrioritised(EMAIL_ID));

      expect(result.current.isToastVisible).toBe(false);
      expect(result.current.announcement).toBe('inbox.actionMove.announcement');
      await waitFor(() => expect(result.current.tabEmphasis).toBe(ACTION_TAB_EMPHASIS.SUBTLE));
    });

    it('tracks the flag per user', () => {
      const first = renderFeedback(USER_ID);
      act(() => first.result.current.onEmailPrioritised(EMAIL_ID));
      first.unmount();

      const { result } = renderFeedback(OTHER_USER_ID);
      act(() => result.current.onEmailPrioritised(EMAIL_ID));

      expect(result.current.isToastVisible).toBe(true);
    });

    it('flies a copy of the email to the Action tab', async () => {
      const { result } = renderFeedback(USER_ID);

      act(() => result.current.onEmailPrioritised(EMAIL_ID, 'Quarterly report'));

      expect(animate).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(document.querySelector(`[data-testid="${ACTION_MOVE_GHOST_TEST_ID}"]`)).toBeNull());
    });
  });

  describe('with prefers-reduced-motion', () => {
    beforeEach(() => mockReducedMotion(true));

    it('shows only the toast and badge — no flight, no tab animation', () => {
      const { result } = renderFeedback(USER_ID);

      act(() => result.current.onEmailPrioritised(EMAIL_ID));

      expect(animate).not.toHaveBeenCalled();
      expect(result.current.isToastVisible).toBe(true);
      expect(result.current.movedCount).toBe(1);
      expect(result.current.tabEmphasis).toBeNull();
      expect(result.current.announcement).toBe('inbox.actionMove.announcementFirst');
    });
  });

  it('re-announces a repeated move so screen readers hear it again', () => {
    const { result } = renderFeedback(USER_ID);
    act(() => result.current.onEmailPrioritised(EMAIL_ID));
    act(() => result.current.onEmailPrioritised(EMAIL_ID));
    const second = result.current.announcement;
    act(() => result.current.onEmailPrioritised(EMAIL_ID));

    expect(result.current.announcement).not.toBe(second);
  });

  it('clears the badge once the user opens the Action tab', async () => {
    const { result, rerender } = renderFeedback(USER_ID);
    act(() => result.current.onEmailPrioritised(EMAIL_ID));
    await waitFor(() => expect(result.current.movedCount).toBe(1));

    rerender({ active: true });

    expect(result.current.movedCount).toBe(0);
  });

  it('View closes the toast and switches to the Action tab', () => {
    const { result, onViewActionTab } = renderFeedback(USER_ID);
    act(() => result.current.onEmailPrioritised(EMAIL_ID));

    act(() => result.current.viewActionTab());

    expect(onViewActionTab).toHaveBeenCalled();
    expect(result.current.isToastVisible).toBe(false);
  });

  it('hides the toast on its own after a while', () => {
    vi.useFakeTimers();
    try {
      mockReducedMotion(true);
      const { result } = renderFeedback(USER_ID);
      act(() => result.current.onEmailPrioritised(EMAIL_ID));

      act(() => {
        vi.advanceTimersByTime(ACTION_MOVE_TOAST_DURATION_MS);
      });

      expect(result.current.isToastVisible).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
