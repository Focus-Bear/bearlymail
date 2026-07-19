import { act, renderHook, waitFor } from '@testing-library/react';
import { Email, getEmailPriorityScore } from 'types/email';
import { captureEvent } from 'utils/posthog';

import { PERCENTAGE_37_5, PERCENTAGE_62_5, PERCENTAGE_87_5 } from 'constants/numbers';

import { useStarCountHandler } from './useStarCountHandler';

vi.mock('utils/posthog', () => ({
  captureEvent: vi.fn(),
}));

vi.mock('types/email', async (importOriginal) => ({
  ...(await importOriginal<typeof import('types/email')>()),
  getEmailPriorityScore: vi.fn(),
}));

const mockedCaptureEvent = captureEvent as jest.MockedFunction<typeof captureEvent>;
const mockedGetEmailPriorityScore = getEmailPriorityScore as jest.MockedFunction<typeof getEmailPriorityScore>;

describe('useStarCountHandler', () => {
  const mockHandleSetStarCountBase = vi.fn();
  const mockOnShowStarDiscrepancy = vi.fn();
  const mockOnShowPriorityOverride = vi.fn();

  const mockEmails: Email[] = [
    {
      id: '1',
      threadId: 't1',
      from: 'test@example.com',
      subject: 'Test 1',
      isRead: false,
      isSnoozed: false,
      receivedAt: '2024-01-01',
      starCount: 0,
    } as Email,
    {
      id: '2',
      threadId: 't2',
      from: 'test@example.com',
      subject: 'Test 2',
      isRead: false,
      isSnoozed: false,
      receivedAt: '2024-01-01',
      starCount: 1,
    } as Email,
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetEmailPriorityScore.mockReturnValue(50);
  });

  describe('handleSetStarCount', () => {
    it('should call base handler and track event', async () => {
      const { result } = renderHook(() =>
        useStarCountHandler({
          emails: mockEmails,
          handleSetStarCountBase: mockHandleSetStarCountBase,
          onShowStarDiscrepancy: mockOnShowStarDiscrepancy,
          onShowPriorityOverride: mockOnShowPriorityOverride,
        })
      );

      mockHandleSetStarCountBase.mockResolvedValue(null);

      await act(async () => {
        await result.current.handleSetStarCount('1', 2);
      });

      expect(mockHandleSetStarCountBase).toHaveBeenCalledWith('1', 2, undefined);
      expect(mockedCaptureEvent).toHaveBeenCalledWith('email_star_set', {
        email_id: '1',
        star_count: 2,
        previous_star_count: 0,
      });
    });

    it('should track previous star count', async () => {
      const { result } = renderHook(() =>
        useStarCountHandler({
          emails: mockEmails,
          handleSetStarCountBase: mockHandleSetStarCountBase,
          onShowStarDiscrepancy: mockOnShowStarDiscrepancy,
          onShowPriorityOverride: mockOnShowPriorityOverride,
        })
      );

      mockHandleSetStarCountBase.mockResolvedValue(null);

      await act(async () => {
        await result.current.handleSetStarCount('2', 3);
      });

      expect(mockedCaptureEvent).toHaveBeenCalledWith('email_star_set', {
        email_id: '2',
        star_count: 3,
        previous_star_count: 1,
      });
    });

    it('should handle email not found', async () => {
      const { result } = renderHook(() =>
        useStarCountHandler({
          emails: mockEmails,
          handleSetStarCountBase: mockHandleSetStarCountBase,
          onShowStarDiscrepancy: mockOnShowStarDiscrepancy,
          onShowPriorityOverride: mockOnShowPriorityOverride,
        })
      );

      mockHandleSetStarCountBase.mockResolvedValue(null);

      await act(async () => {
        await result.current.handleSetStarCount('nonexistent', 2);
      });

      expect(mockHandleSetStarCountBase).toHaveBeenCalled();
      expect(mockedCaptureEvent).toHaveBeenCalledWith('email_star_set', {
        email_id: 'nonexistent',
        star_count: 2,
        previous_star_count: 0,
      });
    });

    it('should show priority override for large discrepancy and priority difference', async () => {
      const { result } = renderHook(() =>
        useStarCountHandler({
          emails: mockEmails,
          handleSetStarCountBase: mockHandleSetStarCountBase,
          onShowStarDiscrepancy: mockOnShowStarDiscrepancy,
          onShowPriorityOverride: mockOnShowPriorityOverride,
        })
      );

      mockedGetEmailPriorityScore.mockReturnValue(30);
      mockHandleSetStarCountBase.mockResolvedValue({
        discrepancy: 2,
        predictedStarCount: 0,
      });

      await act(async () => {
        await result.current.handleSetStarCount('1', 3);
      });

      await waitFor(() => {
        expect(mockOnShowPriorityOverride).toHaveBeenCalledWith('1', 30, PERCENTAGE_87_5, 'star', 'Test 1');
      });
      expect(mockOnShowStarDiscrepancy).not.toHaveBeenCalled();
    });

    it('should show star discrepancy for small priority difference', async () => {
      const { result } = renderHook(() =>
        useStarCountHandler({
          emails: mockEmails,
          handleSetStarCountBase: mockHandleSetStarCountBase,
          onShowStarDiscrepancy: mockOnShowStarDiscrepancy,
          onShowPriorityOverride: mockOnShowPriorityOverride,
        })
      );

      // Star count 3 maps to 87.5 priority. To have a small difference (< 20),
      // we need original priority to be >= 67.5. Using 75 gives difference of 12.5.
      mockedGetEmailPriorityScore.mockReturnValue(75);
      mockHandleSetStarCountBase.mockResolvedValue({
        discrepancy: 2,
        predictedStarCount: 0,
      });

      await act(async () => {
        await result.current.handleSetStarCount('1', 3);
      });

      await waitFor(() => {
        expect(mockOnShowStarDiscrepancy).toHaveBeenCalledWith('1', 3, 0, 'Test 1');
      });
      expect(mockOnShowPriorityOverride).not.toHaveBeenCalled();
    });

    it('should not show modals when discrepancy is small', async () => {
      const { result } = renderHook(() =>
        useStarCountHandler({
          emails: mockEmails,
          handleSetStarCountBase: mockHandleSetStarCountBase,
          onShowStarDiscrepancy: mockOnShowStarDiscrepancy,
          onShowPriorityOverride: mockOnShowPriorityOverride,
        })
      );

      mockHandleSetStarCountBase.mockResolvedValue({
        discrepancy: 1,
        predictedStarCount: 1,
      });

      await act(async () => {
        await result.current.handleSetStarCount('1', 2);
      });

      expect(mockOnShowStarDiscrepancy).not.toHaveBeenCalled();
      expect(mockOnShowPriorityOverride).not.toHaveBeenCalled();
    });

    it('should not show modals when star count is 0', async () => {
      const { result } = renderHook(() =>
        useStarCountHandler({
          emails: mockEmails,
          handleSetStarCountBase: mockHandleSetStarCountBase,
          onShowStarDiscrepancy: mockOnShowStarDiscrepancy,
          onShowPriorityOverride: mockOnShowPriorityOverride,
        })
      );

      mockHandleSetStarCountBase.mockResolvedValue({
        discrepancy: 3,
        predictedStarCount: 3,
      });

      await act(async () => {
        await result.current.handleSetStarCount('1', 0);
      });

      expect(mockOnShowStarDiscrepancy).not.toHaveBeenCalled();
      expect(mockOnShowPriorityOverride).not.toHaveBeenCalled();
    });

    it('should map star count to correct priority scores', async () => {
      const { result } = renderHook(() =>
        useStarCountHandler({
          emails: mockEmails,
          handleSetStarCountBase: mockHandleSetStarCountBase,
          onShowStarDiscrepancy: mockOnShowStarDiscrepancy,
          onShowPriorityOverride: mockOnShowPriorityOverride,
        })
      );

      mockedGetEmailPriorityScore.mockReturnValue(10);

      // Test star count 0 -> 12.5
      mockHandleSetStarCountBase.mockResolvedValue({
        discrepancy: 3,
        predictedStarCount: 3,
      });
      await act(async () => {
        await result.current.handleSetStarCount('1', 0);
      });
      expect(mockOnShowPriorityOverride).not.toHaveBeenCalled();

      // Test star count 1 -> 37.5
      mockHandleSetStarCountBase.mockResolvedValue({
        discrepancy: 2,
        predictedStarCount: 0,
      });
      await act(async () => {
        await result.current.handleSetStarCount('1', 1);
      });
      await waitFor(() => {
        expect(mockOnShowPriorityOverride).toHaveBeenCalledWith('1', 10, PERCENTAGE_37_5, 'star', 'Test 1');
      });

      // Test star count 2 -> 62.5
      mockOnShowPriorityOverride.mockClear();
      mockHandleSetStarCountBase.mockResolvedValue({
        discrepancy: 2,
        predictedStarCount: 0,
      });
      await act(async () => {
        await result.current.handleSetStarCount('1', 2);
      });
      await waitFor(() => {
        expect(mockOnShowPriorityOverride).toHaveBeenCalledWith('1', 10, PERCENTAGE_62_5, 'star', 'Test 1');
      });

      // Test star count 3 -> 87.5
      mockOnShowPriorityOverride.mockClear();
      mockHandleSetStarCountBase.mockResolvedValue({
        discrepancy: 2,
        predictedStarCount: 0,
      });
      await act(async () => {
        await result.current.handleSetStarCount('1', 3);
      });
      await waitFor(() => {
        expect(mockOnShowPriorityOverride).toHaveBeenCalledWith('1', 10, PERCENTAGE_87_5, 'star', 'Test 1');
      });
    });
  });
});
