import { Email, isEmailPriorityCalculating, isEmailPriorityUnresolved } from './email';

/** Minimal Email factory — only the fields the priority helpers read. */
function makeEmail(overrides: Partial<Email>): Email {
  return {
    id: 'email-1',
    ...overrides,
  } as Email;
}

describe('email priority helpers', () => {
  describe('isEmailPriorityCalculating', () => {
    it('is true only when the backend is actively processing', () => {
      expect(isEmailPriorityCalculating(makeEmail({ isProcessingPriority: true }))).toBe(true);
    });

    it('is false when nothing is processing, even with no score and no breakdown', () => {
      // Previously this returned true and showed a perpetual "Calculating..." spinner
      // for emails whose prioritisation had silently failed.
      expect(
        isEmailPriorityCalculating(makeEmail({ isProcessingPriority: false, priorityScore: null })),
      ).toBe(false);
    });

    it('is false for a successfully scored email', () => {
      expect(
        isEmailPriorityCalculating(
          makeEmail({
            isProcessingPriority: false,
            priorityScore: 0,
            priorityExplanation: { score: 0, breakdown: [{ factor: 'x', value: 0, description: 'y' }] } as Email['priorityExplanation'],
          }),
        ),
      ).toBe(false);
    });
  });

  describe('isEmailPriorityUnresolved', () => {
    it('is true when not processing, no score, and no breakdown (stuck/failed)', () => {
      expect(
        isEmailPriorityUnresolved(makeEmail({ isProcessingPriority: false, priorityScore: null })),
      ).toBe(true);
    });

    it('is false while actively calculating', () => {
      expect(isEmailPriorityUnresolved(makeEmail({ isProcessingPriority: true }))).toBe(false);
    });

    it('is false for an explicit score of 0 even without a breakdown (legit low priority)', () => {
      // A real score of 0 is resolved; only a null/undefined score means "never scored".
      expect(
        isEmailPriorityUnresolved(makeEmail({ isProcessingPriority: false, priorityScore: 0 })),
      ).toBe(false);
    });

    it('is false for a legitimately low-priority email that has a breakdown', () => {
      expect(
        isEmailPriorityUnresolved(
          makeEmail({
            isProcessingPriority: false,
            priorityScore: 0,
            priorityExplanation: { score: 0, breakdown: [{ factor: 'x', value: 0, description: 'y' }] } as Email['priorityExplanation'],
          }),
        ),
      ).toBe(false);
    });

    it('is false for a scored email', () => {
      expect(
        isEmailPriorityUnresolved(makeEmail({ isProcessingPriority: false, priorityScore: 42 })),
      ).toBe(false);
    });
  });
});
