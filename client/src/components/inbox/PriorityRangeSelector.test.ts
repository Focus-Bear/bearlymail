/**
 * Unit tests for the computeBucketClick helper (issue #1735, refined for #1970).
 *
 * When a user clicks a priority-bucket label, the nearest slider handle (min or max)
 * moves to expand or narrow the range. Distance is measured from each handle to the
 * bucket CENTER. When the chosen handle is already at the boundary, we swap to the
 * other handle so something always visibly changes.
 */
import { computeBucketClick } from './PriorityRangeSelector';

const BUCKET = 20; // VISUAL_BUCKET_SIZE

describe('computeBucketClick', () => {
  describe('which handle moves', () => {
    it('moves the min handle when min is closer to the bucket center', () => {
      // minVal=0, maxVal=100, target=20 (center 30) → distMin=30, distMax=70 → min moves
      const result = computeBucketClick(0, 100, 20, BUCKET);
      expect(result).toEqual({ newMinVal: 20, newMaxVal: 100 });
    });

    it('moves the min handle on a tie (equal distance from both handles)', () => {
      // minVal=0, maxVal=100, target=40 (center 50) → distMin=50, distMax=50 → tie → min moves
      const result = computeBucketClick(0, 100, 40, BUCKET);
      expect(result).toEqual({ newMinVal: 40, newMaxVal: 100 });
    });
  });

  describe('clamping to maintain separation', () => {
    it('clamps min so it stays at least one bucket below maxVal', () => {
      // minVal=0, maxVal=40, target=40 (center 50) → max is closer → max expands to 60
      // (Different from old behavior: now expands rather than clamping min.)
      const result = computeBucketClick(0, 40, 40, BUCKET);
      expect(result.newMaxVal - result.newMinVal).toBeGreaterThanOrEqual(BUCKET);
    });

    it('always returns at least one bucket of separation between handles', () => {
      const result = computeBucketClick(60, 100, 60, BUCKET);
      expect(result.newMaxVal - result.newMinVal).toBeGreaterThanOrEqual(BUCKET);
    });
  });

  describe('no-op swap (handle already at boundary)', () => {
    it('clicking Very Low when min is already at 0 narrows max to the Very Low bucket end', () => {
      // minVal=0, maxVal=100, target=0 (center 10) → min is closer but already at 0
      // → swap: max moves to bucketEnd=20
      const result = computeBucketClick(0, 100, 0, BUCKET);
      expect(result).toEqual({ newMinVal: 0, newMaxVal: 20 });
    });

    it('clicking Very High when max is already at 100 narrows min to the Very High bucket start', () => {
      // minVal=0, maxVal=100, target=80 (center 90) → max is closer but already at 100
      // → swap: min moves to bucketStart=80
      const result = computeBucketClick(0, 100, 80, BUCKET);
      expect(result).toEqual({ newMinVal: 80, newMaxVal: 100 });
    });
  });

  describe('expansion vs narrowing', () => {
    it('clicking a bucket inside the current range narrows by moving the nearer handle', () => {
      // minVal=0, maxVal=60, target=40 (center 50) → max is closer
      // → max moves to bucketEnd=60, but that is a no-op (=maxVal),
      //   so we swap and move min to bucketStart=40
      const result = computeBucketClick(0, 60, 40, BUCKET);
      expect(result).toEqual({ newMinVal: 40, newMaxVal: 60 });
    });

    it('clicking a bucket below the current min expands min downward', () => {
      // minVal=60, maxVal=100, target=20 (center 30) → min is closer
      // → min moves to bucketStart=20
      const result = computeBucketClick(60, 100, 20, BUCKET);
      expect(result).toEqual({ newMinVal: 20, newMaxVal: 100 });
    });

    it('clicking a bucket above the current max expands max upward', () => {
      // minVal=0, maxVal=40, target=80 (center 90) → max is closer
      // → max moves to bucketEnd=100
      const result = computeBucketClick(0, 40, 80, BUCKET);
      expect(result).toEqual({ newMinVal: 0, newMaxVal: 100 });
    });
  });
});
