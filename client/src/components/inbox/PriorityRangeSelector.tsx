/**
 * PriorityRangeSelector — dual-thumb range slider for filtering emails by priority score.
 *
 * Design: 5 buckets (Very Low, Low, Medium, High, Very High) with a segmented colour track
 * (slate → blue → amber → orange → red). Draggable min/max handles snap to bucket boundaries.
 *
 * Fix #1452 (bugs 3 & 4): The slider now maps between visual positions (0-20-40-60-80-100)
 * and actual server score values (null/0/15/30/50/null). Previously, score values were used
 * directly as visual positions, causing the slider to show wrong buckets (e.g. score 30 "High"
 * appeared at visual position 30 which is in the "Low" visual bucket).
 *
 * Replaces the old pill-based VisualPriorityFilter for issue #1414.
 *
 * UI-only component — no state management, localStorage, or API concerns.
 * Wires to `minPriority` / `maxPriority` in `useInboxFilters`.
 */
import React, { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import {
  PRIORITY_BUCKET_RANGES,
  scoreMaxToVisual,
  scoreMinToVisual,
  VISUAL_BUCKET_SIZE,
  VISUAL_SLIDER_MAX,
  VISUAL_SLIDER_MIN,
  visualMaxToScore,
  visualMinToScore,
} from 'constants/priorityBuckets';
import { KEY_ARROW_DOWN, KEY_ARROW_LEFT, KEY_ARROW_RIGHT, KEY_ARROW_UP, KEY_END, KEY_ENTER, KEY_HOME, KEY_SPACE } from 'constants/strings';

// ── Bucket definitions ────────────────────────────────────────────────────────

export interface PriorityBucket {
  label: string;
  /** Inclusive lower bound (maps to minPriority). */
  min: number;
  /** Inclusive upper bound (maps to maxPriority). null = no cap. */
  max: number | null;
  trackColor: string;
  dotColor: string;
}

/**
 * Visual bucket config for the range slider.
 * Labels are sourced from PRIORITY_BUCKET_RANGES (constants/priorityBuckets.ts) so the bucket
 * set stays the single source of truth. Only display properties (trackColor, dotColor) are added here.
 *
 * min/max are VISUAL slider positions (0-20-40-60-80-100), NOT actual server scores. They are
 * compared against minVal/maxVal (also visual) throughout this component — in getBucketForValue,
 * SegmentTrack, and BucketLabels — to decide which segment a thumb falls in and which segments are
 * active. Reusing the score-based bounds from PRIORITY_BUCKET_RANGES here would desync the active
 * highlight and labels from the thumb positions (e.g. a thumb sitting on a tick would look like it
 * was "midway" because the highlighted range started one bucket over). The score↔visual mapping
 * lives in constants/priorityBuckets.ts (SCORE_VISUAL_MAP) and is the only place scores are used.
 *
 * Fix #1526 bug 1: track colors now come from theme.colors.priorityBuckets instead of
 * hardcoded literals, so they participate in the theme system.
 */
export const PRIORITY_BUCKETS: PriorityBucket[] = PRIORITY_BUCKET_RANGES.map((bucketDef, index) => {
  const TRACK_COLORS = [
    theme.colors.priorityBuckets.veryLow,
    theme.colors.priorityBuckets.low,
    theme.colors.priorityBuckets.medium,
    theme.colors.priorityBuckets.high,
    theme.colors.priorityBuckets.veryHigh,
  ];
  const isLastBucket = index === PRIORITY_BUCKET_RANGES.length - 1;
  return {
    label: bucketDef.label,
    min: index * VISUAL_BUCKET_SIZE,
    // Last bucket (Very High) has no upper cap → null, matching the "no max" filter semantics.
    max: isLastBucket ? null : (index + 1) * VISUAL_BUCKET_SIZE,
    trackColor: TRACK_COLORS[index] ?? theme.colors.priorityBuckets.veryLow,
    dotColor: TRACK_COLORS[index] ?? theme.colors.priorityBuckets.veryLow,
  };
});

/** Slider tick positions — visual bucket boundaries (even spacing, 0-100). */
const TICKS = [
  VISUAL_SLIDER_MIN,
  VISUAL_BUCKET_SIZE,
  VISUAL_BUCKET_SIZE * 2,
  VISUAL_BUCKET_SIZE * 3,
  VISUAL_BUCKET_SIZE * 4,
  VISUAL_SLIDER_MAX,
];
const SLIDER_MIN = VISUAL_SLIDER_MIN;
const SLIDER_MAX = VISUAL_SLIDER_MAX;
/** Lower visual bound of the Very High bucket — last snap point before the slider max. */
const VERY_HIGH_MIN = VISUAL_BUCKET_SIZE * 4;
/** Opacity for inactive (dimmed) track segments and bucket labels. */
const INACTIVE_OPACITY = 0.2;
/** Opacity for inactive bucket labels (slightly higher than track for readability). */
const INACTIVE_LABEL_OPACITY = 0.4;

/** Snap a raw value to the nearest tick. */
function snapToTick(value: number): number {
  return TICKS.reduce((nearest, tick) => (Math.abs(tick - value) < Math.abs(nearest - value) ? tick : nearest));
}

/** Convert a slider value (0-100) to a percentage string for CSS. */
function pct(value: number): string {
  return `${((value - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)) * 100}%`;
}

// ── Derived label helpers ─────────────────────────────────────────────────────

function getBucketForValue(value: number): PriorityBucket | undefined {
  if (value >= VERY_HIGH_MIN) {
    return PRIORITY_BUCKETS[4];
  }
  return PRIORITY_BUCKETS.find(bucket => value >= bucket.min && value < (bucket.max ?? Infinity));
}

function getRangeLabel(minVal: number, maxVal: number): string {
  const minBucket = getBucketForValue(minVal);
  const maxBucket = getBucketForValue(maxVal >= SLIDER_MAX ? VERY_HIGH_MIN : maxVal - 1);
  if (!minBucket || !maxBucket) {
    return `${minVal} – ${maxVal}`;
  }
  if (minBucket.label === maxBucket.label) {
    return minBucket.label;
  }
  return `${minBucket.label} → ${maxBucket.label}`;
}

// ── Segment track ─────────────────────────────────────────────────────────────

interface SegmentTrackProps {
  minVal: number;
  maxVal: number;
}

const SegmentTrack: React.FC<SegmentTrackProps> = ({ minVal, maxVal }) => (
  <div
    aria-hidden="true"
    style={{
      position: 'absolute',
      top: '50%',
      left: 0,
      right: 0,
      height: '8px',
      transform: 'translateY(-50%)',
      borderRadius: theme.borderRadius.full,
      overflow: 'hidden',
      display: 'flex',
    }}
  >
    {PRIORITY_BUCKETS.map(bucket => {
      const bucketMin = bucket.min;
      const bucketMax = bucket.max ?? 100;
      const isActive = bucketMin < maxVal && bucketMax > minVal;
      return (
        <div
          key={bucket.label}
          style={{
            flex: 1,
            backgroundColor: bucket.trackColor,
            opacity: isActive ? 1 : INACTIVE_OPACITY,
            transition: 'opacity 0.15s ease',
          }}
        />
      );
    })}
  </div>
);

// ── Thumb handle ──────────────────────────────────────────────────────────────

interface ThumbProps {
  value: number;
  ariaLabel: string;
  ariaValueText: string;
  onDrag: (newValue: number) => void;
  trackRef: React.RefObject<HTMLDivElement | null>;
  color: string;
  /** Fix #1526 bug 3: max thumb sits above min thumb so it's reachable when they overlap. */
  isMaxThumb?: boolean;
}

const Thumb: React.FC<ThumbProps> = ({
  value,
  ariaLabel,
  ariaValueText,
  onDrag,
  trackRef,
  color,
  isMaxThumb = false,
}) => {
  const isDragging = useRef(false);

  const getValueFromEvent = useCallback(
    (clientX: number): number => {
      if (!trackRef.current) {
        return value;
      }
      const rect = trackRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return snapToTick(Math.round(ratio * 100));
    },
    [trackRef, value]
  );

  const handleMouseDown = useCallback(
    (mouseEvent: React.MouseEvent) => {
      mouseEvent.preventDefault();
      isDragging.current = true;

      const onMouseMove = (moveEvent: MouseEvent) => {
        if (!isDragging.current) {
          return;
        }
        onDrag(getValueFromEvent(moveEvent.clientX));
      };
      const onMouseUp = () => {
        isDragging.current = false;
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [onDrag, getValueFromEvent]
  );

  const handleTouchStart = useCallback(
    (touchEvent: React.TouchEvent) => {
      touchEvent.preventDefault();
      isDragging.current = true;

      const onTouchMove = (touchEvent: TouchEvent) => {
        if (!isDragging.current || !touchEvent.touches[0]) {
          return;
        }
        onDrag(getValueFromEvent(touchEvent.touches[0].clientX));
      };
      const onTouchEnd = () => {
        isDragging.current = false;
        window.removeEventListener('touchmove', onTouchMove);
        window.removeEventListener('touchend', onTouchEnd);
      };
      window.addEventListener('touchmove', onTouchMove, { passive: false });
      window.addEventListener('touchend', onTouchEnd);
    },
    [onDrag, getValueFromEvent]
  );

  const handleKeyDown = useCallback(
    (keyEvent: React.KeyboardEvent) => {
      const step = VISUAL_BUCKET_SIZE;
      if (keyEvent.key === KEY_ARROW_LEFT || keyEvent.key === KEY_ARROW_DOWN) {
        keyEvent.preventDefault();
        onDrag(Math.max(SLIDER_MIN, value - step));
      } else if (keyEvent.key === KEY_ARROW_RIGHT || keyEvent.key === KEY_ARROW_UP) {
        keyEvent.preventDefault();
        onDrag(Math.min(SLIDER_MAX, value + step));
      } else if (keyEvent.key === KEY_HOME) {
        keyEvent.preventDefault();
        onDrag(SLIDER_MIN);
      } else if (keyEvent.key === KEY_END) {
        keyEvent.preventDefault();
        onDrag(SLIDER_MAX);
      }
    },
    [value, onDrag]
  );

  return (
    <div
      role="slider"
      aria-valuemin={SLIDER_MIN}
      aria-valuemax={SLIDER_MAX}
      aria-valuenow={value}
      aria-label={ariaLabel}
      aria-valuetext={ariaValueText}
      tabIndex={0}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onKeyDown={handleKeyDown}
      style={{
        position: 'absolute',
        top: '50%',
        left: pct(value),
        transform: 'translate(-50%, -50%)',
        width: '24px',
        height: '24px',
        borderRadius: '50%',
        // Fix #1526 bug 1: use theme token instead of hardcoded '#FFFFFF'
        backgroundColor: theme.colors.common.white,
        border: `2px solid ${color}`,
        boxShadow: `0 1px 4px rgba(0,0,0,0.2), 0 0 0 3px ${color}22`,
        cursor: 'grab',
        // Fix #1526 bug 3: max thumb (isMaxThumb=true) stacks above min thumb so it remains
        // draggable when thumbs overlap on a single-bucket selection.
        zIndex: isMaxThumb ? 3 : 2,
        transition: 'box-shadow 0.1s ease',
        outline: 'none',
        touchAction: 'none',
      }}
      onFocus={event => {
        event.currentTarget.style.boxShadow = `0 1px 4px rgba(0,0,0,0.2), 0 0 0 4px ${color}44`;
      }}
      onBlur={event => {
        event.currentTarget.style.boxShadow = `0 1px 4px rgba(0,0,0,0.2), 0 0 0 3px ${color}22`;
      }}
    />
  );
};

// ── Bucket labels ─────────────────────────────────────────────────────────────

interface BucketLabelsProps {
  minVal: number;
  maxVal: number;
  bucketCounts?: Record<string, number>;
  /** Called when user clicks a bucket label; receives the bucket's visual start position. */
  onBucketClick: (visualPos: number) => void;
}

const BucketLabels: React.FC<BucketLabelsProps> = ({ minVal, maxVal, bucketCounts, onBucketClick }) => (
  <div
    style={{
      display: 'flex',
      marginTop: theme.spacing.sm,
    }}
  >
    {PRIORITY_BUCKETS.map((bucket, index) => {
      const bucketMin = bucket.min;
      const bucketMax = bucket.max ?? 100;
      const isActive = bucketMin < maxVal && bucketMax > minVal;
      const count = bucketCounts?.[bucket.label];
      const visualPos = index * VISUAL_BUCKET_SIZE;
      return (
        <div
          key={bucket.label}
          role="button"
          tabIndex={0}
          aria-label={bucket.label}
          onClick={() => onBucketClick(visualPos)}
          onKeyDown={event => {
            if (event.key === KEY_ENTER || event.key === KEY_SPACE) {
              event.preventDefault();
              onBucketClick(visualPos);
            }
          }}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '2px',
            opacity: isActive ? 1 : INACTIVE_LABEL_OPACITY,
            transition: 'opacity 0.15s ease',
            cursor: 'pointer',
          }}
        >
          <div
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: bucket.dotColor,
            }}
          />
          <span
            style={{
              fontSize: theme.typography.fontSize.md,
              fontWeight: theme.typography.fontWeight.medium,
              color: theme.colors.text.secondary,
              whiteSpace: 'nowrap',
              textAlign: 'center',
            }}
          >
            {bucket.label}
          </span>
          {count !== undefined && (
            <span
              style={{
                fontSize: theme.typography.fontSize.xs,
                color: theme.colors.text.tertiary,
              }}
            >
              {count}
            </span>
          )}
        </div>
      );
    })}
  </div>
);

// ── Bucket click helper ───────────────────────────────────────────────────────

/**
 * Given the current slider positions and a clicked bucket's visual start position,
 * returns the new {minVal, maxVal} after moving the nearest slider handle to expand
 * or narrow the range.
 *
 * Distance is measured from each handle to the bucket CENTER so that clicking a bucket
 * clearly outside the current range expands to include it (e.g. clicking "Very High" when
 * filter is "Low → High" expands max to include VH rather than triggering the old
 * narrowing-at-boundary edge case). When the result would be a no-op (handle already at
 * the boundary), we swap to the other handle so something always visibly changes.
 *
 * Exported for unit testing.
 */
export function computeBucketClick(
  minVal: number,
  maxVal: number,
  visualPos: number,
  bucketSize: number
): { newMinVal: number; newMaxVal: number } {
  const bucketCenter = visualPos + bucketSize / 2;
  const bucketStart = visualPos;
  const bucketEnd = Math.min(visualPos + bucketSize, SLIDER_MAX);

  const distFromMin = Math.abs(minVal - bucketCenter);
  const distFromMax = Math.abs(maxVal - bucketCenter);

  let newMinVal: number;
  let newMaxVal: number;

  if (distFromMin <= distFromMax) {
    newMinVal = Math.min(bucketStart, maxVal - bucketSize);
    newMaxVal = maxVal;
  } else {
    newMinVal = minVal;
    newMaxVal = Math.max(bucketEnd, minVal + bucketSize);
  }

  // If the chosen handle is already at that boundary, move the other one instead.
  if (newMinVal === minVal && newMaxVal === maxVal) {
    if (distFromMin <= distFromMax) {
      newMaxVal = Math.max(bucketEnd, minVal + bucketSize);
    } else {
      newMinVal = Math.min(bucketStart, maxVal - bucketSize);
    }
  }

  return { newMinVal, newMaxVal };
}

// ── Main component ────────────────────────────────────────────────────────────

export interface PriorityRangeSelectorProps {
  /**
   * Lower bound for the priority filter (actual server score value).
   * null = no lower bound (show all including Very Low).
   * Maps to `minPriority` in useInboxFilters.
   * Examples: null (all), 0 (≥Low), 15 (≥Medium), 30 (≥High), 50 (≥Very High).
   */
  selectedMin: number | null;
  /**
   * Upper bound for the priority filter (actual server score value).
   * null = no upper cap (show all up to Very High).
   * Maps to `maxPriority` in useInboxFilters.
   * Examples: null (no cap), 0 (≤Very Low), 15 (≤Low), 30 (≤Medium), 50 (≤High).
   */
  selectedMax: number | null;
  /**
   * Called when the user changes the range.
   * Passes (minPriority, maxPriority) as actual server score values:
   *   - null min = no lower bound
   *   - null max = no upper cap
   */
  onChange: (min: number | null, max: number | null) => void;
  /** Optional per-bucket email counts for display under labels. */
  bucketCounts?: Record<string, number>;
  /** Optional total count shown in the header. */
  totalCount?: number;
}

export const PriorityRangeSelector: React.FC<PriorityRangeSelectorProps> = ({
  selectedMin,
  selectedMax,
  onChange,
  bucketCounts,
  totalCount,
}) => {
  const { t } = useTranslation();
  const trackRef = useRef<HTMLDivElement>(null);

  // Map actual score values to visual slider positions (0-100, multiples of 20).
  // Fix #1452 bug 4: previously score values were used directly as visual positions,
  // causing e.g. score 30 (High) to show at visual position 30 (Low bucket 20-40).
  const minVal = scoreMinToVisual(selectedMin);
  const maxVal = scoreMaxToVisual(selectedMax);

  const handleMinDrag = useCallback(
    (newVal: number) => {
      const clampedMin = Math.min(newVal, maxVal - VISUAL_BUCKET_SIZE);
      // Convert visual position back to actual score before emitting
      const outMin = visualMinToScore(clampedMin);
      const outMax = visualMaxToScore(maxVal);
      onChange(outMin, outMax);
    },
    [maxVal, onChange]
  );

  const handleMaxDrag = useCallback(
    (newVal: number) => {
      const clampedMax = Math.max(newVal, minVal + VISUAL_BUCKET_SIZE);
      // Convert visual position back to actual score before emitting
      const outMin = visualMinToScore(minVal);
      const outMax = visualMaxToScore(clampedMax);
      onChange(outMin, outMax);
    },
    [minVal, onChange]
  );

  const handleBucketClick = useCallback(
    (visualPos: number) => {
      const { newMinVal, newMaxVal } = computeBucketClick(minVal, maxVal, visualPos, VISUAL_BUCKET_SIZE);
      onChange(visualMinToScore(newMinVal), visualMaxToScore(newMaxVal));
    },
    [minVal, maxVal, onChange]
  );

  const rangeLabel = getRangeLabel(minVal, maxVal);
  const isAllSelected = minVal <= 0 && maxVal >= 100;

  // Determine thumb colour from the active high end
  const thumbColor = getBucketForValue(maxVal >= SLIDER_MAX ? VERY_HIGH_MIN : maxVal - 1)?.trackColor ?? '#64748B';

  const headerCountText = totalCount !== undefined ? ` (${totalCount})` : '';
  const headerRangeText = isAllSelected
    ? t('inbox.filters.priorityAll', 'All priorities')
    : `${rangeLabel}${headerCountText}`;

  return (
    <div
      style={{
        flex: '1',
        minWidth: '280px',
        // Fix #1571 Bug 2: flex column layout so this card fills its parent height when
        // InboxFilters uses alignItems: 'stretch' for equal-height side-by-side cards.
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: theme.colors.background.paper,
        border: `1px solid ${theme.colors.border.light}`,
        borderRadius: theme.borderRadius.md,
        padding: theme.spacing.md,
        boxShadow: theme.shadows.sm,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: theme.spacing.md,
        }}
      >
        <span
          style={{
            fontSize: theme.typography.fontSize.lg,
            fontWeight: theme.typography.fontWeight.semibold,
            color: theme.colors.text.primary,
          }}
        >
          {t('inbox.filters.priority', 'Priority Filter')}
        </span>
        <span
          style={{
            fontSize: theme.typography.fontSize.lg,
            color: theme.colors.text.tertiary,
          }}
        >
          {headerRangeText}
        </span>
      </div>

      {/* Slider track + thumbs */}
      <div
        ref={trackRef}
        style={{
          position: 'relative',
          height: '28px',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        {/* Background segments */}
        <SegmentTrack minVal={minVal} maxVal={maxVal} />

        {/* Filled range overlay between thumbs */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: '50%',
            left: pct(minVal),
            width: `calc(${pct(maxVal)} - ${pct(minVal)})`,
            height: '8px',
            transform: 'translateY(-50%)',
            backgroundColor: thumbColor,
            opacity: 0.25,
            pointerEvents: 'none',
            borderRadius: theme.borderRadius.full,
          }}
        />

        {/* Min thumb */}
        <Thumb
          value={minVal}
          ariaLabel={t('inbox.filters.priorityMinHandle', 'Minimum priority')}
          ariaValueText={getBucketForValue(minVal)?.label ?? `${minVal}`}
          onDrag={handleMinDrag}
          trackRef={trackRef}
          color={thumbColor}
        />

        {/* Max thumb — isMaxThumb ensures it sits on top when thumbs overlap (fix #1526 bug 3) */}
        <Thumb
          value={maxVal}
          ariaLabel={t('inbox.filters.priorityMaxHandle', 'Maximum priority')}
          ariaValueText={getBucketForValue(maxVal >= SLIDER_MAX ? VERY_HIGH_MIN : maxVal - 1)?.label ?? `${maxVal}`}
          onDrag={handleMaxDrag}
          trackRef={trackRef}
          color={thumbColor}
          isMaxThumb
        />
      </div>

      {/* Bucket labels + counts */}
      <BucketLabels minVal={minVal} maxVal={maxVal} bucketCounts={bucketCounts} onBucketClick={handleBucketClick} />
    </div>
  );
};
