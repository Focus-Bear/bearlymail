import { act, renderHook } from '@testing-library/react';
import { Email } from 'types/email';

import { useModals } from './useModals';

describe('useModals', () => {
  describe('initialization', () => {
    it('should initialize with all modals hidden', () => {
      const { result } = renderHook(() => useModals());

      expect(result.current.starDiscrepancyModal).toBeNull();
      expect(result.current.priorityOverrideModal).toBeNull();
      expect(result.current.urgencyOverrideModal).toBeNull();
      expect(result.current.priorityFeedbackModal).toBeNull();
      expect(result.current.blockConfirmEmail).toBeNull();
    });
  });

  describe('starDiscrepancyModal', () => {
    it('should show star discrepancy modal', () => {
      const { result } = renderHook(() => useModals());

      act(() => {
        result.current.showStarDiscrepancy('email-1', 3, 1);
      });

      expect(result.current.starDiscrepancyModal).toEqual({
        show: true,
        emailId: 'email-1',
        userStarCount: 3,
        predictedStarCount: 1,
      });
    });

    it('should hide star discrepancy modal', () => {
      const { result } = renderHook(() => useModals());

      act(() => {
        result.current.showStarDiscrepancy('email-1', 3, 1);
        result.current.hideStarDiscrepancy();
      });

      expect(result.current.starDiscrepancyModal).toBeNull();
    });

    it('should allow direct setStarDiscrepancyModal', () => {
      const { result } = renderHook(() => useModals());

      act(() => {
        result.current.setStarDiscrepancyModal({
          show: true,
          emailId: 'email-2',
          userStarCount: 2,
          predictedStarCount: 0,
        });
      });

      expect(result.current.starDiscrepancyModal?.emailId).toBe('email-2');
    });
  });

  describe('priorityOverrideModal', () => {
    it('should show priority override modal', () => {
      const { result } = renderHook(() => useModals());

      act(() => {
        result.current.showPriorityOverride('email-1', 50, 80);
      });

      expect(result.current.priorityOverrideModal).toEqual({
        show: true,
        emailId: 'email-1',
        originalPriorityScore: 50,
        newPriorityScore: 80,
        context: 'manual',
      });
    });

    it('should hide priority override modal', () => {
      const { result } = renderHook(() => useModals());

      act(() => {
        result.current.showPriorityOverride('email-1', 50, 80);
        result.current.hidePriorityOverride();
      });

      expect(result.current.priorityOverrideModal).toBeNull();
    });
  });

  describe('urgencyOverrideModal', () => {
    it('should show urgency override modal', () => {
      const { result } = renderHook(() => useModals());

      act(() => {
        result.current.showUrgencyOverride('thread-1', 60);
      });

      expect(result.current.urgencyOverrideModal).toEqual({
        show: true,
        threadId: 'thread-1',
        currentUrgencyScore: 60,
      });
    });

    it('should hide urgency override modal', () => {
      const { result } = renderHook(() => useModals());

      act(() => {
        result.current.showUrgencyOverride('thread-1', 60);
        result.current.hideUrgencyOverride();
      });

      expect(result.current.urgencyOverrideModal).toBeNull();
    });
  });

  describe('priorityFeedbackModal', () => {
    it('should show priority feedback modal', () => {
      const { result } = renderHook(() => useModals());

      act(() => {
        result.current.showPriorityFeedback('email-1', 75);
      });

      expect(result.current.priorityFeedbackModal).toEqual({
        show: true,
        emailId: 'email-1',
        currentPriorityScore: 75,
      });
    });

    it('should hide priority feedback modal', () => {
      const { result } = renderHook(() => useModals());

      act(() => {
        result.current.showPriorityFeedback('email-1', 75);
        result.current.hidePriorityFeedback();
      });

      expect(result.current.priorityFeedbackModal).toBeNull();
    });
  });

  describe('blockConfirmEmail', () => {
    it('should show block confirm with email', () => {
      const { result } = renderHook(() => useModals());
      const email: Email = {
        id: 'email-1',
        from: 'spam@example.com',
        subject: 'Spam',
      } as Email;

      act(() => {
        result.current.showBlockConfirm(email);
      });

      expect(result.current.blockConfirmEmail).toEqual(email);
    });

    it('should hide block confirm', () => {
      const { result } = renderHook(() => useModals());
      const email: Email = {
        id: 'email-1',
        from: 'spam@example.com',
      } as Email;

      act(() => {
        result.current.showBlockConfirm(email);
        result.current.hideBlockConfirm();
      });

      expect(result.current.blockConfirmEmail).toBeNull();
    });

    it('should allow direct setBlockConfirmEmail', () => {
      const { result } = renderHook(() => useModals());
      const email: Email = {
        id: 'email-2',
        from: 'test@example.com',
      } as Email;

      act(() => {
        result.current.setBlockConfirmEmail(email);
      });

      expect(result.current.blockConfirmEmail).toEqual(email);
    });
  });

  describe('multiple modals', () => {
    it('should handle multiple modals independently', () => {
      const { result } = renderHook(() => useModals());

      act(() => {
        result.current.showStarDiscrepancy('email-1', 3, 1);
        result.current.showPriorityOverride('email-2', 50, 80);
        result.current.showUrgencyOverride('thread-1', 60);
      });

      expect(result.current.starDiscrepancyModal).not.toBeNull();
      expect(result.current.priorityOverrideModal).not.toBeNull();
      expect(result.current.urgencyOverrideModal).not.toBeNull();
    });

    it('should allow closing one modal without affecting others', () => {
      const { result } = renderHook(() => useModals());

      act(() => {
        result.current.showStarDiscrepancy('email-1', 3, 1);
        result.current.showPriorityOverride('email-2', 50, 80);
        result.current.hideStarDiscrepancy();
      });

      expect(result.current.starDiscrepancyModal).toBeNull();
      expect(result.current.priorityOverrideModal).not.toBeNull();
    });
  });
});
