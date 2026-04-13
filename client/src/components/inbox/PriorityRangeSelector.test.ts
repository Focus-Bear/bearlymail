/**
 * Unit tests for the computeBucketClick helper (issue #1735).
 *
 * When a user clicks a priority-bucket label, the nearest slider handle (min or max)
 * snaps to the bucket's visual start position. These tests verify the snap + clamping
 * logic without needing to render the full component.
 */
import { computeBucketClick } from './PriorityRangeSelector';

const BUCKET = 20; // VISUAL_BUCKET_SIZE

describe('computeBucketClick', () => {
  describe('which handle moves', () => {
    it('moves the min handle when it is closer to the target', () => {
      // minVal=0, maxVal=100, target=20 → distMin=20, distMax=80 → min moves
      const result = computeBucketClick(0, 100, 20, BUCKET);
      expect(result).toEqual({ newMinVal: 20, newMaxVal: 100 });
    });

    it('moves the max handle when it is closer to the target', () => {
      // minVal=0, maxVal=100, target=80 → distMin=80, distMax=20 → max moves
      const result = computeBucketClick(0, 100, 80, BUCKET);
      expect(result).toEqual({ newMinVal: 0, newMaxVal: 80 });
    });

    it('moves the min handle on a tie (equal distance from both handles)', () => {
      // minVal=20, maxVal=60, target=40 → distMin=20, distMax=20 → tie → min moves
      const result = computeBucketClick(20, 60, 40, BUCKET);
      expect(result).toEqual({ newMinVal: 40, newMaxVal: 60 });
    });

    it('moves the max handle when max is strictly closer', () => {
      // minVal=0, maxVal=60, target=40 → distMin=40, distMax=20 → max moves
      const result = computeBucketClick(0, 60, 40, BUCKET);
      expect(result).toEqual({ newMinVal: 0, newMaxVal: 40 });
    });
  });

  describe('clamping to maintain separation', () => {
    it('clamps min so it stays at least one bucket below maxVal', () => {
      // minVal=0, maxVal=40, target=40 → min would move to 40 → clamped to 40-20=20
      const result = computeBucketClick(0, 40, 40, BUCKET);
      expect(result.newMinVal).toBe(20);
      expect(result.newMaxVal).toBe(40);
    });

    it('clamps max so it stays at least one bucket above minVal', () => {
      // minVal=60, maxVal=100, target=60 → max would move to 60 → clamped to 60+20=80
      const result = computeBucketClick(60, 100, 60, BUCKET);
      expect(result.newMinVal).toBe(60);
      expect(result.newMaxVal).toBe(80);
    });
  });

  describe('edge positions', () => {
    it('handles clicking the Very Low bucket (visual pos 0) when min is already at 0', () => {
      // target=0, minVal=0, maxVal=100 → distMin=0, distMax=100 → min moves, no-op
      const result = computeBucketClick(0, 100, 0, BUCKET);
      expect(result).toEqual({ newMinVal: 0, newMaxVal: 100 });
    });

    it('handles clicking the Very High bucket (visual pos 80)', () => {
      // target=80, minVal=0, maxVal=100 → distMin=80, distMax=20 → max moves to 80
      const result = computeBucketClick(0, 100, 80, BUCKET);
      expect(result).toEqual({ newMinVal: 0, newMaxVal: 80 });
    });

    it('handles clicking when both handles are already at the extremes', () => {
      const result = computeBucketClick(0, 100, 40, BUCKET);
      // distMin=40, distMax=60 → min moves to 40
      expect(result).toEqual({ newMinVal: 40, newMaxVal: 100 });
    });
  });
});
