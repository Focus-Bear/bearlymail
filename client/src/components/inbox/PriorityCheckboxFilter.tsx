/**
 * PriorityCheckboxFilter — one checkbox per priority bucket, highest priority on the left.
 *
 * Replaces the dual-thumb range slider, which users found hard to operate. The boxes
 * still describe a single score range (see priorityCheckboxes.helpers.ts for how a click
 * maps to a range), so the filter state and server query are unchanged.
 *
 * UI-only component — no state management, localStorage, or API concerns.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { EMOJI_CHECK } from 'constants/emojis';
import { PRIORITY_LABEL_TO_KEY } from 'constants/priorityBuckets';

import {
  getCheckedBucketIndexes,
  PRIORITY_BUCKETS_HIGH_FIRST,
  PriorityRange,
  togglePriorityBucket,
} from './priorityCheckboxes.helpers';

export const PRIORITY_CHECKBOX_TEST_ID_PREFIX = 'priority-checkbox-';

const CHECKBOX_SIZE = '18px';
const CHECKBOX_BORDER_WIDTH = '2px';

type PriorityBucketKey = (typeof PRIORITY_LABEL_TO_KEY)[string];

interface PriorityCheckboxFilterProps {
  selectedMin: number | null;
  selectedMax: number | null;
  onChange: (minPriority: number | null, maxPriority: number | null) => void;
  /** Per-bucket email counts keyed by bucket label ("Very High", "High", …). */
  bucketCounts?: Record<string, number>;
  /** Total email count for the selected range, shown in the header. */
  totalCount?: number;
}

interface PriorityCheckboxProps {
  bucketKey: PriorityBucketKey;
  label: string;
  count?: number;
  isChecked: boolean;
  /** The last ticked box can't be unticked — an empty filter would show nothing. */
  isLocked: boolean;
  onToggle: () => void;
}

const PriorityCheckbox: React.FC<PriorityCheckboxProps> = ({ bucketKey, label, count, isChecked, isLocked, onToggle }) => {
  const color = theme.colors.priorityBuckets[bucketKey];
  return (
    <label
      data-testid={`${PRIORITY_CHECKBOX_TEST_ID_PREFIX}${bucketKey}`}
      style={{
        flex: '1 1 0',
        minWidth: '96px',
        display: 'flex',
        alignItems: 'center',
        gap: theme.spacing.sm,
        padding: `${theme.spacing.sm} ${theme.spacing.md}`,
        borderRadius: theme.borderRadius.md,
        border: `1px solid ${isChecked ? color : theme.colors.border.medium}`,
        backgroundColor: isChecked ? theme.colors.background.subtle : theme.colors.background.paper,
        cursor: isLocked ? 'default' : 'pointer',
        transition: theme.transitions.fast,
        userSelect: 'none',
      }}
    >
      <input
        type="checkbox"
        checked={isChecked}
        disabled={isLocked}
        onChange={onToggle}
        aria-label={label}
        style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
      />
      <span
        aria-hidden="true"
        style={{
          width: CHECKBOX_SIZE,
          height: CHECKBOX_SIZE,
          flexShrink: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: theme.borderRadius.sm,
          border: `${CHECKBOX_BORDER_WIDTH} solid ${color}`,
          backgroundColor: isChecked ? color : theme.colors.background.paper,
          color: theme.colors.text.inverse,
          fontSize: theme.typography.fontSize.sm,
          fontWeight: theme.typography.fontWeight.bold,
          lineHeight: 1,
        }}
      >
        {isChecked ? EMOJI_CHECK : null}
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span
          style={{
            fontSize: theme.typography.fontSize.md,
            fontWeight: theme.typography.fontWeight.semibold,
            color: theme.colors.text.primary,
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
        {count !== undefined && (
          <span style={{ fontSize: theme.typography.fontSize.sm, color: theme.colors.text.tertiary }}>{count}</span>
        )}
      </span>
    </label>
  );
};

export const PriorityCheckboxFilter: React.FC<PriorityCheckboxFilterProps> = ({
  selectedMin,
  selectedMax,
  onChange,
  bucketCounts,
  totalCount,
}) => {
  const { t } = useTranslation();
  const range: PriorityRange = { minPriority: selectedMin, maxPriority: selectedMax };
  const checkedIndexes = getCheckedBucketIndexes(range);
  const isAllSelected = selectedMin === null && selectedMax === null;

  const handleToggle = (index: number) => {
    const next = togglePriorityBucket(range, index);
    if (next.minPriority !== selectedMin || next.maxPriority !== selectedMax) {
      onChange(next.minPriority, next.maxPriority);
    }
  };

  const headerText = isAllSelected
    ? t('inbox.filters.priorityAll')
    : t('inbox.filters.prioritySelectedCount', { count: totalCount ?? 0 });

  return (
    <div
      role="group"
      aria-label={t('inbox.filters.priority')}
      style={{
        flex: '1',
        minWidth: '280px',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: theme.colors.background.paper,
        border: `1px solid ${theme.colors.border.light}`,
        borderRadius: theme.borderRadius.md,
        padding: theme.spacing.md,
        boxShadow: theme.shadows.sm,
      }}
    >
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
          {t('inbox.filters.priority')}
        </span>
        <span style={{ fontSize: theme.typography.fontSize.lg, color: theme.colors.text.tertiary }}>{headerText}</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        {PRIORITY_BUCKETS_HIGH_FIRST.map((bucket, index) => {
          const bucketKey = PRIORITY_LABEL_TO_KEY[bucket.label];
          const isChecked = checkedIndexes.includes(index);
          return (
            <PriorityCheckbox
              key={bucket.label}
              bucketKey={bucketKey}
              label={t(`inbox.filters.buckets.${bucketKey}`)}
              count={bucketCounts?.[bucket.label]}
              isChecked={isChecked}
              isLocked={isChecked && checkedIndexes.length === 1}
              onToggle={() => handleToggle(index)}
            />
          );
        })}
      </div>
    </div>
  );
};
