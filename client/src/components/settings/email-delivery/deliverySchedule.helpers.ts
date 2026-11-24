import type { TFunction } from 'i18next';

import type { BatchSchedule } from 'hooks/settings/useBatchSchedule';

import { formatTime12h } from './deliveryTimesManager.helpers';

/** The delivery presets offered instead of setting days and times one by one (#482). */
export const DELIVERY_PRESET = {
  CALM: 'calm',
  BALANCED: 'balanced',
  ALWAYS_ON: 'alwaysOn',
} as const;

export type DeliveryPresetId = (typeof DELIVERY_PRESET)[keyof typeof DELIVERY_PRESET];

const WEEKDAYS = [1, 2, 3, 4, 5];
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const WEEKEND = [0, 6];

const BATCHED_PRESETS: Record<
  Exclude<DeliveryPresetId, 'alwaysOn'>,
  Pick<BatchSchedule, 'deliveryDays' | 'deliveryTimes'>
> = {
  [DELIVERY_PRESET.CALM]: { deliveryDays: WEEKDAYS, deliveryTimes: ['11:00', '15:00'] },
  [DELIVERY_PRESET.BALANCED]: { deliveryDays: WEEKDAYS, deliveryTimes: ['09:00', '11:00', '14:00', '16:00'] },
};

export const DELIVERY_PRESET_IDS: readonly DeliveryPresetId[] = [
  DELIVERY_PRESET.CALM,
  DELIVERY_PRESET.BALANCED,
  DELIVERY_PRESET.ALWAYS_ON,
];

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

/** True when both lists hold the same values, in any order. */
function sameItems(left: readonly (number | string)[], right: readonly (number | string)[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const sortedRight = right.map(String).sort();
  return left
    .map(String)
    .sort()
    .every((value, index) => value === sortedRight[index]);
}

/**
 * The schedule with a preset applied. "Always on" only turns batching off, so
 * the user's days and times come back if they pick Calm or Balanced again.
 */
export function applyDeliveryPreset(schedule: BatchSchedule, presetId: DeliveryPresetId): BatchSchedule {
  if (presetId === DELIVERY_PRESET.ALWAYS_ON) {
    return { ...schedule, isEnabled: false };
  }
  const preset = BATCHED_PRESETS[presetId];
  return {
    ...schedule,
    isEnabled: true,
    deliveryDays: [...preset.deliveryDays],
    deliveryTimes: [...preset.deliveryTimes],
  };
}

/** Which preset the schedule matches, or null when the user set their own days or times. */
export function activeDeliveryPreset(schedule: BatchSchedule): DeliveryPresetId | null {
  if (!schedule.isEnabled) {
    return DELIVERY_PRESET.ALWAYS_ON;
  }
  const match = (Object.keys(BATCHED_PRESETS) as (keyof typeof BATCHED_PRESETS)[]).find(
    id =>
      sameItems(schedule.deliveryDays, BATCHED_PRESETS[id].deliveryDays) &&
      sameItems(schedule.deliveryTimes, BATCHED_PRESETS[id].deliveryTimes)
  );
  return match ?? null;
}

/**
 * Whether the schedule can be saved as it stands. A batched schedule with no
 * day or no time has no delivery window, and the server then releases every
 * held email at once, so it waits until the user has picked both.
 */
export function canSaveDeliverySchedule(schedule: BatchSchedule): boolean {
  return !schedule.isEnabled || (schedule.deliveryDays.length > 0 && schedule.deliveryTimes.length > 0);
}

function describeDays(days: number[], translate: TFunction): string {
  if (sameItems(days, EVERY_DAY)) {
    return translate('settings.delivery.summary.everyDay');
  }
  if (sameItems(days, WEEKDAYS)) {
    return translate('settings.delivery.summary.weekdays');
  }
  if (sameItems(days, WEEKEND)) {
    return translate('settings.delivery.summary.weekends');
  }
  const names = [...days]
    .sort((dayA, dayB) => dayA - dayB)
    .map(day => translate(`settings.delivery.days.${DAY_KEYS[day]}`));
  return translate('settings.delivery.summary.someDays', { days: joinList(names, translate) });
}

/** "A", "A and B", "A, B and C" in the user's language. */
function joinList(items: string[], translate: TFunction): string {
  if (items.length <= 1) {
    return items.join('');
  }
  return `${items.slice(0, -1).join(', ')} ${translate('settings.delivery.summary.and')} ${items[items.length - 1]}`;
}

/**
 * The schedule as one plain sentence, e.g. "Non-urgent email arrives at
 * 11:00 AM and 3:00 PM on weekdays. Urgent email still comes straight away."
 */
export function describeDeliverySchedule(schedule: BatchSchedule, translate: TFunction): string {
  if (!schedule.isEnabled) {
    return translate('settings.delivery.summary.alwaysOn');
  }
  if (!canSaveDeliverySchedule(schedule)) {
    return translate('settings.delivery.summary.incomplete');
  }
  const times = joinList([...schedule.deliveryTimes].sort().map(formatTime12h), translate);
  const sentence = translate('settings.delivery.summary.batched', {
    times,
    days: describeDays(schedule.deliveryDays, translate),
  });
  return schedule.urgentBypassSchedule ? `${sentence} ${translate('settings.delivery.summary.urgent')}` : sentence;
}
