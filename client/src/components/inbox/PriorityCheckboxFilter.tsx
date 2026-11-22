/**
 * PriorityCheckboxFilter — the priority filter's choices as a vertical checkbox list, one row
 * per priority bucket, highest priority at the top.
 *
 * The boxes describe a single score range (see priorityCheckboxes.helpers.ts for how a click
 * maps to a range), so the filter state and server query are one min/max pair.
 *
 * UI-only component — no state management, localStorage, or API concerns.
 */
import React from 'react';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { PRIORITY_LABEL_TO_KEY } from 'constants/priorityBuckets';

import { FilterMenuFooter, FilterMenuOption } from './FilterMenuOption';
import {
  getCheckedBucketIndexes,
  PRIORITY_BUCKETS_HIGH_FIRST,
  PriorityRange,
  togglePriorityBucket,
} from './priorityCheckboxes.helpers';

export const PRIORITY_CHECKBOX_TEST_ID_PREFIX = 'priority-checkbox-';
export const PRIORITY_SHOW_ALL_TEST_ID = 'priority-show-all';

interface PriorityCheckboxFilterProps {
  selectedMin: number | null;
  selectedMax: number | null;
  onChange: (minPriority: number | null, maxPriority: number | null) => void;
  /** Per-bucket email counts keyed by bucket label ("Very High", "High", …). */
  bucketCounts?: Record<string, number>;
  /** Total email count for the selected range, shown in the footer. */
  totalCount?: number;
  touch?: boolean;
}

export const PriorityCheckboxFilter: React.FC<PriorityCheckboxFilterProps> = ({
  selectedMin,
  selectedMax,
  onChange,
  bucketCounts,
  totalCount,
  touch = false,
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

  return (
    <>
      {PRIORITY_BUCKETS_HIGH_FIRST.map((bucket, index) => {
        const bucketKey = PRIORITY_LABEL_TO_KEY[bucket.label];
        const isChecked = checkedIndexes.includes(index);
        return (
          <FilterMenuOption
            key={bucket.label}
            testId={`${PRIORITY_CHECKBOX_TEST_ID_PREFIX}${bucketKey}`}
            label={t(`inbox.filters.buckets.${bucketKey}`)}
            count={bucketCounts?.[bucket.label]}
            dotColor={theme.colors.priorityBuckets[bucketKey]}
            isChecked={isChecked}
            // The last ticked box can't be unticked — an empty filter would show nothing.
            isDisabled={isChecked && checkedIndexes.length === 1}
            touch={touch}
            onToggle={() => handleToggle(index)}
          />
        );
      })}
      {!isAllSelected && (
        <FilterMenuFooter
          status={
            totalCount === undefined ? undefined : t('inbox.filters.prioritySelectedCount', { count: totalCount })
          }
          resetLabel={t('inbox.filters.showAll')}
          resetTestId={PRIORITY_SHOW_ALL_TEST_ID}
          onReset={() => onChange(null, null)}
          touch={touch}
        />
      )}
    </>
  );
};
