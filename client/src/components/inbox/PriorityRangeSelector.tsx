/**
 * PriorityRangeSelector — dual-thumb range slider for filtering emails by priority score.
 *
 * Design: 5 buckets (Very Low 0-20, Low 20-40, Medium 40-60, High 60-80, Very High 80-100)
 * with a segmented colour track (slate → blue → amber → orange → red).
 * Draggable min/max handles snap to bucket boundaries (multiples of 20).
 *
 * Replaces the old pill-based VisualPriorityFilter for issue #1414.
 *
 * UI-only component — no state management, localStorage, or API concerns.
 * Wires to `minPriority` / `maxPriority` in `useInboxFilters`.
 */
import React, { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { BUCKET_SIZE, PRIORITY_BUCKET_RANGES } from 'constants/priorityBuckets';

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
 * Min/max boundaries are sourced from PRIORITY_BUCKET_RANGES (constants/priorityBuckets.ts)
 * — single source of truth. Only display properties (trackColor, dotColor) are added here.
 */
export const PRIORITY_BUCKETS: PriorityBucket[] = PRIORITY_BUCKET_RANGES.map((bucketDef, index) => {
  const TRACK_COLORS = ['#64748B', '#3B82F6', '#F59E0B', '#F97316', '#EF4444'];
  return {
    label: bucketDef.label,
    min: bucketDef.min,
    max: bucketDef.max,
    trackColor: TRACK_COLORS[index] ?? '#64748B',
    dotColor: TRACK_COLORS[index] ?? '#64748B',
  };
});

/** Slider tick positions — bucket boundaries including 0 and 100. */
const TICKS = [0, BUCKET_SIZE, BUCKET_SIZE * 2, BUCKET_SIZE * 3, BUCKET_SIZE * 4, 100];
const SLIDER_MIN = 0;
const SLIDER_MAX = 100;
/** Lower bound of the Very High bucket — last snap point before the slider max. */
const VERY_HIGH_MIN = BUCKET_SIZE * 4;
/** Opacity for inactive (dimmed) track segments and bucket labels. */
const INACTIVE_OPACITY = 0.2;
/** Opacity for inactive bucket labels (slightly higher than track for readability). */
const INACTIVE_LABEL_OPACITY = 0.4;

/** Snap a raw value to the nearest tick. */
function snapToTick(value: number): number {
  return TICKS.reduce((nearest, tick) =>
    Math.abs(tick - value) < Math.abs(nearest - value) ? tick : nearest
  );
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
      height: '6px',
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
}

const Thumb: React.FC<ThumbProps> = ({ value, ariaLabel, ariaValueText, onDrag, trackRef, color }) => {
  const isDragging = useRef(false);

  const getValueFromEvent = useCallback((clientX: number): number => {
    if (!trackRef.current) {
return value;
}
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return snapToTick(Math.round(ratio * 100));
  }, [trackRef, value]);

  const handleMouseDown = useCallback((mouseEvent: React.MouseEvent) => {
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
  }, [onDrag, getValueFromEvent]);

  const handleTouchStart = useCallback((touchEvent: React.TouchEvent) => {
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
  }, [onDrag, getValueFromEvent]);

  const handleKeyDown = useCallback((keyEvent: React.KeyboardEvent) => {
    const step = BUCKET_SIZE;
    if (keyEvent.key === 'ArrowLeft' || keyEvent.key === 'ArrowDown') {
      keyEvent.preventDefault();
      onDrag(Math.max(SLIDER_MIN, value - step));
    } else if (keyEvent.key === 'ArrowRight' || keyEvent.key === 'ArrowUp') {
      keyEvent.preventDefault();
      onDrag(Math.min(SLIDER_MAX, value + step));
    } else if (keyEvent.key === 'Home') {
      keyEvent.preventDefault();
      onDrag(SLIDER_MIN);
    } else if (keyEvent.key === 'End') {
      keyEvent.preventDefault();
      onDrag(SLIDER_MAX);
    }
  }, [value, onDrag]);

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
        width: '20px',
        height: '20px',
        borderRadius: '50%',
        backgroundColor: '#FFFFFF',
        border: `2px solid ${color}`,
        boxShadow: `0 1px 4px rgba(0,0,0,0.2), 0 0 0 3px ${color}22`,
        cursor: 'grab',
        zIndex: 2,
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
}

const BucketLabels: React.FC<BucketLabelsProps> = ({ minVal, maxVal, bucketCounts }) => (
  <div
    aria-hidden="true"
    style={{
      display: 'flex',
      marginTop: theme.spacing.sm,
    }}
  >
    {PRIORITY_BUCKETS.map(bucket => {
      const bucketMin = bucket.min;
      const bucketMax = bucket.max ?? 100;
      const isActive = bucketMin < maxVal && bucketMax > minVal;
      const count = bucketCounts?.[bucket.label];
      return (
        <div
          key={bucket.label}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '2px',
            opacity: isActive ? 1 : INACTIVE_LABEL_OPACITY,
            transition: 'opacity 0.15s ease',
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
              fontSize: theme.typography.fontSize.sm,
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

// ── Main component ────────────────────────────────────────────────────────────

export interface PriorityRangeSelectorProps {
  /**
   * Lower bound for the priority filter.
   * null = 0 (show all from very low).
   * Maps to `minPriority` in useInboxFilters.
   */
  selectedMin: number | null;
  /**
   * Upper bound for the priority filter.
   * null = 100 (show all up to very high).
   * Maps to `maxPriority` in useInboxFilters.
   */
  selectedMax: number | null;
  /**
   * Called when the user changes the range.
   * Passes (minPriority, maxPriority) where:
   *   - 0 min → pass null (no lower bound)
   *   - 100 max → pass null (no upper bound)
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

  // Map null to slider edges
  const minVal = selectedMin ?? 0;
  const maxVal = selectedMax ?? 100;

  const handleMinDrag = useCallback((newVal: number) => {
    const clampedMin = Math.min(newVal, maxVal - BUCKET_SIZE);
    const outMin = clampedMin <= SLIDER_MIN ? null : clampedMin;
    const outMax = maxVal >= SLIDER_MAX ? null : maxVal;
    onChange(outMin, outMax);
  }, [maxVal, onChange]);

  const handleMaxDrag = useCallback((newVal: number) => {
    const clampedMax = Math.max(newVal, minVal + BUCKET_SIZE);
    const outMin = minVal <= SLIDER_MIN ? null : minVal;
    const outMax = clampedMax >= SLIDER_MAX ? null : clampedMax;
    onChange(outMin, outMax);
  }, [minVal, onChange]);

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
          height: '24px',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        {/* Background segments */}
        <SegmentTrack minVal={minVal} maxVal={maxVal} />

        {/* Min thumb */}
        <Thumb
          value={minVal}
          ariaLabel={t('inbox.filters.priorityMinHandle', 'Minimum priority')}
          ariaValueText={getBucketForValue(minVal)?.label ?? `${minVal}`}
          onDrag={handleMinDrag}
          trackRef={trackRef}
          color={thumbColor}
        />

        {/* Max thumb */}
        <Thumb
          value={maxVal}
          ariaLabel={t('inbox.filters.priorityMaxHandle', 'Maximum priority')}
          ariaValueText={getBucketForValue(maxVal >= SLIDER_MAX ? VERY_HIGH_MIN : maxVal - 1)?.label ?? `${maxVal}`}
          onDrag={handleMaxDrag}
          trackRef={trackRef}
          color={thumbColor}
        />
      </div>

      {/* Bucket labels + counts */}
      <BucketLabels minVal={minVal} maxVal={maxVal} bucketCounts={bucketCounts} />
    </div>
  );
};
