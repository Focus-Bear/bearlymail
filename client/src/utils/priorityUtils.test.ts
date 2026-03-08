import { getPriorityBadge } from './priorityUtils';

// Mock the theme module
jest.mock('theme/theme', () => ({
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
    // New calibration: < 0 = very low, 0-20 = low, 20-40 = medium, > 40 = high
    it('should return high priority badge for score > 40', () => {
      const result = getPriorityBadge(41);
      expect(result.label).toBe('High');
      expect(result.color).toBe('#EF4444'); // error color
      expect(result.bg).toBe('#FCEFE0'); // light4
    });

    it('should return high priority badge for score 100', () => {
      const result = getPriorityBadge(100);
      expect(result.label).toBe('High');
      expect(result.color).toBe('#EF4444');
      expect(result.bg).toBe('#FCEFE0');
    });

    it('should return medium priority badge for score >= 20 and <= 40', () => {
      const result = getPriorityBadge(30);
      expect(result.label).toBe('Medium');
      expect(result.color).toBe('#0B0B0B'); // text.primary
      expect(result.bg).toBe('#F9D8B3'); // light3
    });

    it('should return medium priority badge for score 20', () => {
      const result = getPriorityBadge(20);
      expect(result.label).toBe('Medium');
      expect(result.color).toBe('#0B0B0B');
      expect(result.bg).toBe('#F9D8B3');
    });

    it('should return low priority badge for score >= 0 and < 20', () => {
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

    it('should return very low priority badge for negative scores', () => {
      const result = getPriorityBadge(-10);
      expect(result.label).toBe('Very Low');
      // Should use secondary text color and subtle background
    });

    it('should use translation function when provided', () => {
      const tFunc = jest.fn((key: string) => {
        const translations: Record<string, string> = {
          'priority.high': 'Alto',
          'priority.medium': 'Medio',
          'priority.low': 'Bajo',
          'priority.veryLow': 'Muy Bajo',
        };
        return translations[key] || key;
      });

      const highResult = getPriorityBadge(50, tFunc);
      expect(highResult.label).toBe('Alto');
      expect(tFunc).toHaveBeenCalledWith('priority.high');

      const mediumResult = getPriorityBadge(30, tFunc);
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
      const highResult = getPriorityBadge(50);
      expect(highResult.label).toBe('High');

      const mediumResult = getPriorityBadge(30);
      expect(mediumResult.label).toBe('Medium');

      const lowResult = getPriorityBadge(10);
      expect(lowResult.label).toBe('Low');

      const veryLowResult = getPriorityBadge(-5);
      expect(veryLowResult.label).toBe('Very Low');
    });

    it('should handle boundary values correctly', () => {
      const result41 = getPriorityBadge(41);
      expect(result41.label).toBe('High');

      const result40 = getPriorityBadge(40);
      expect(result40.label).toBe('Medium');

      const result20 = getPriorityBadge(20);
      expect(result20.label).toBe('Medium');

      const result19 = getPriorityBadge(19);
      expect(result19.label).toBe('Low');

      const result0 = getPriorityBadge(0);
      expect(result0.label).toBe('Low');

      const resultNeg1 = getPriorityBadge(-1);
      expect(resultNeg1.label).toBe('Very Low');
    });

    it('should handle decimal scores', () => {
      const result = getPriorityBadge(40.1);
      expect(result.label).toBe('High');

      const mediumResult = getPriorityBadge(20.5);
      expect(mediumResult.label).toBe('Medium');

      const lowResult = getPriorityBadge(19.9);
      expect(lowResult.label).toBe('Low');
    });
  });
});
