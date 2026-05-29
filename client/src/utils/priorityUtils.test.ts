import { getPriorityBadge } from './priorityUtils';

// Mock the theme module
vi.mock('theme/theme', () => ({
  theme: {
    colors: {
      accent: {
        error: '#EF4444',
      },
      text: {
        primary: '#0B0B0B',
        secondary: '#6B7280',
      },
      primary: {
        main: '#E9902C',
      },
      sunray: {
        light3: '#F9D8B3',
        light4: '#FCEFE0',
      },
      background: {
        subtle: '#F3F4F6',
      },
    },
  },
}));

describe('priorityUtils', () => {
  describe('getPriorityBadge', () => {
    // Tier calibration (aligned with PRIORITY_RANGES in useInboxFilters.ts):
    // < 0:     very low  (score < 0)
    // 0–15:    low       (score >= 0 && <= 15)
    // 15–30:   medium    (score > 15 && <= 30)
    // 30–50:   high      (score > 30 && <= 50)
    // > 50:    very high (score > 50)

    it('should return very high priority badge for score > 50', () => {
      const result = getPriorityBadge(51);
      expect(result.label).toBe('Very High');
      expect(result.color).toBe('#EF4444'); // error color
      expect(result.bg).toBe('#FCEFE0'); // light4
    });

    it('should return very high priority badge for score 100', () => {
      const result = getPriorityBadge(100);
      expect(result.label).toBe('Very High');
      expect(result.color).toBe('#EF4444');
      expect(result.bg).toBe('#FCEFE0');
    });

    it('should return high priority badge for score > 30 and <= 50', () => {
      const result = getPriorityBadge(40);
      expect(result.label).toBe('High');
      expect(result.color).toBe('#EF4444'); // error color
      expect(result.bg).toBe('#FCEFE0'); // light4
    });

    it('should return high priority badge for score 50 (boundary)', () => {
      const result = getPriorityBadge(50);
      expect(result.label).toBe('High');
    });

    it('should return medium priority badge for score > 15 and <= 30', () => {
      const result = getPriorityBadge(20);
      expect(result.label).toBe('Medium');
      expect(result.color).toBe('#0B0B0B'); // text.primary
      expect(result.bg).toBe('#F9D8B3'); // light3
    });

    it('should return medium priority badge for score 30 (boundary)', () => {
      const result = getPriorityBadge(30);
      expect(result.label).toBe('Medium');
    });

    it('should return low priority badge for score >= 0 and <= 15', () => {
      const result = getPriorityBadge(10);
      expect(result.label).toBe('Low');
      expect(result.color).toBe('#E9902C'); // primary.main
      expect(result.bg).toBe('#FCEFE0'); // light4
    });

    it('should return low priority badge for score 0', () => {
      const result = getPriorityBadge(0);
      expect(result.label).toBe('Low');
      expect(result.color).toBe('#E9902C');
      expect(result.bg).toBe('#FCEFE0');
    });

    it('should return low priority badge for score 15 (boundary)', () => {
      const result = getPriorityBadge(15);
      expect(result.label).toBe('Low');
    });

    it('should return very low priority badge for negative scores', () => {
      const result = getPriorityBadge(-10);
      expect(result.label).toBe('Very Low');
      // Should use secondary text color and subtle background
    });

    it('should use translation function when provided', () => {
      const tFunc = vi.fn((key: string) => {
        const translations: Record<string, string> = {
          'priority.veryHigh': 'Muy Alto',
          'priority.high': 'Alto',
          'priority.medium': 'Medio',
          'priority.low': 'Bajo',
          'priority.veryLow': 'Muy Bajo',
        };
        return translations[key] || key;
      });

      const veryHighResult = getPriorityBadge(55, tFunc);
      expect(veryHighResult.label).toBe('Muy Alto');
      expect(tFunc).toHaveBeenCalledWith('priority.veryHigh');

      const highResult = getPriorityBadge(40, tFunc);
      expect(highResult.label).toBe('Alto');
      expect(tFunc).toHaveBeenCalledWith('priority.high');

      const mediumResult = getPriorityBadge(20, tFunc);
      expect(mediumResult.label).toBe('Medio');
      expect(tFunc).toHaveBeenCalledWith('priority.medium');

      const lowResult = getPriorityBadge(10, tFunc);
      expect(lowResult.label).toBe('Bajo');
      expect(tFunc).toHaveBeenCalledWith('priority.low');

      const veryLowResult = getPriorityBadge(-5, tFunc);
      expect(veryLowResult.label).toBe('Muy Bajo');
      expect(tFunc).toHaveBeenCalledWith('priority.veryLow');
    });

    it('should use default labels when translation function is not provided', () => {
      const veryHighResult = getPriorityBadge(55);
      expect(veryHighResult.label).toBe('Very High');

      const highResult = getPriorityBadge(40);
      expect(highResult.label).toBe('High');

      const mediumResult = getPriorityBadge(20);
      expect(mediumResult.label).toBe('Medium');

      const lowResult = getPriorityBadge(10);
      expect(lowResult.label).toBe('Low');

      const veryLowResult = getPriorityBadge(-5);
      expect(veryLowResult.label).toBe('Very Low');
    });

    it('should handle boundary values correctly', () => {
      // Very High: > 50
      expect(getPriorityBadge(51).label).toBe('Very High');
      expect(getPriorityBadge(50).label).toBe('High');

      // High: > 30 and <= 50
      expect(getPriorityBadge(50).label).toBe('High');
      expect(getPriorityBadge(31).label).toBe('High');
      expect(getPriorityBadge(30).label).toBe('Medium');

      // Medium: > 15 and <= 30
      expect(getPriorityBadge(30).label).toBe('Medium');
      expect(getPriorityBadge(16).label).toBe('Medium');
      expect(getPriorityBadge(15).label).toBe('Low');

      // Low: >= 0 and <= 15
      expect(getPriorityBadge(15).label).toBe('Low');
      expect(getPriorityBadge(0).label).toBe('Low');

      // Very Low: < 0
      expect(getPriorityBadge(-1).label).toBe('Very Low');
    });

    it('should handle decimal scores', () => {
      expect(getPriorityBadge(50.1).label).toBe('Very High');
      expect(getPriorityBadge(30.5).label).toBe('High');
      expect(getPriorityBadge(15.1).label).toBe('Medium');
      expect(getPriorityBadge(14.9).label).toBe('Low');
    });
  });
});
