import type { TFunction } from 'i18next';

import type { BatchSchedule } from 'hooks/settings/useBatchSchedule';

import {
  activeDeliveryPreset,
  applyDeliveryPreset,
  canSaveDeliverySchedule,
  DELIVERY_PRESET,
  describeDeliverySchedule,
} from './deliverySchedule.helpers';

const EN_TEXT: Record<string, string> = {
  'settings.delivery.summary.alwaysOn': 'New email shows up as soon as it arrives.',
  'settings.delivery.summary.batched': 'Non-urgent email arrives at {{times}} {{days}}.',
  'settings.delivery.summary.everyDay': 'every day',
  'settings.delivery.summary.weekdays': 'on weekdays',
  'settings.delivery.summary.weekends': 'on weekends',
  'settings.delivery.summary.someDays': 'on {{days}}',
  'settings.delivery.summary.urgent': 'Urgent email still comes straight away.',
  'settings.delivery.summary.incomplete': 'Pick at least one day and one time.',
  'settings.delivery.summary.and': 'and',
  'settings.delivery.days.mon': 'Monday',
  'settings.delivery.days.wed': 'Wednesday',
};

const translate = ((key: string, params?: Record<string, string>) =>
  Object.entries(params ?? {}).reduce(
    (text, [name, value]) => text.replace(`{{${name}}}`, value),
    EN_TEXT[key] ?? key
  )) as unknown as TFunction;

const schedule = (overrides: Partial<BatchSchedule> = {}): BatchSchedule => ({
  deliveryDays: [1, 2, 3, 4, 5],
  deliveryTimes: ['11:00', '15:00'],
  timezone: 'Australia/Melbourne',
  isEnabled: true,
  urgentBypassSchedule: false,
  ...overrides,
});

describe('describeDeliverySchedule', () => {
  it('says the times and days in one sentence', () => {
    expect(describeDeliverySchedule(schedule(), translate)).toBe(
      'Non-urgent email arrives at 11:00 AM and 3:00 PM on weekdays.'
    );
  });

  it('adds that urgent email skips the wait', () => {
    expect(describeDeliverySchedule(schedule({ urgentBypassSchedule: true }), translate)).toBe(
      'Non-urgent email arrives at 11:00 AM and 3:00 PM on weekdays. Urgent email still comes straight away.'
    );
  });

  it('names every day, weekends, or the picked days', () => {
    expect(describeDeliverySchedule(schedule({ deliveryDays: [0, 1, 2, 3, 4, 5, 6] }), translate)).toContain(
      'every day'
    );
    expect(describeDeliverySchedule(schedule({ deliveryDays: [6, 0] }), translate)).toContain('on weekends');
    expect(describeDeliverySchedule(schedule({ deliveryDays: [3, 1] }), translate)).toContain(
      'on Monday and Wednesday'
    );
  });

  it('lists times in order however they were added', () => {
    expect(describeDeliverySchedule(schedule({ deliveryTimes: ['16:30', '09:00', '13:00'] }), translate)).toContain(
      '9:00 AM, 1:00 PM and 4:30 PM'
    );
  });

  it('says email comes straight in when batching is off', () => {
    expect(describeDeliverySchedule(schedule({ isEnabled: false }), translate)).toBe(
      'New email shows up as soon as it arrives.'
    );
  });

  it('asks for a day and a time when one is missing', () => {
    expect(describeDeliverySchedule(schedule({ deliveryTimes: [] }), translate)).toBe(
      'Pick at least one day and one time.'
    );
  });
});

describe('delivery presets', () => {
  it('recognises Calm and Balanced in any order, and a hand-made schedule as none', () => {
    expect(activeDeliveryPreset(schedule({ deliveryTimes: ['15:00', '11:00'] }))).toBe(DELIVERY_PRESET.CALM);
    expect(activeDeliveryPreset(applyDeliveryPreset(schedule(), DELIVERY_PRESET.BALANCED))).toBe(
      DELIVERY_PRESET.BALANCED
    );
    expect(activeDeliveryPreset(schedule({ deliveryTimes: ['10:00'] }))).toBeNull();
  });

  it('Always on turns batching off but keeps the days and times to come back to', () => {
    const custom = schedule({ deliveryTimes: ['10:00'] });
    const alwaysOn = applyDeliveryPreset(custom, DELIVERY_PRESET.ALWAYS_ON);

    expect(alwaysOn.isEnabled).toBe(false);
    expect(alwaysOn.deliveryTimes).toEqual(['10:00']);
    expect(activeDeliveryPreset(alwaysOn)).toBe(DELIVERY_PRESET.ALWAYS_ON);
  });

  it('picking Calm turns batching back on and keeps the time zone', () => {
    const calm = applyDeliveryPreset(schedule({ isEnabled: false, timezone: 'Asia/Manila' }), DELIVERY_PRESET.CALM);

    expect(calm).toMatchObject({ isEnabled: true, timezone: 'Asia/Manila', deliveryTimes: ['11:00', '15:00'] });
  });
});

describe('canSaveDeliverySchedule', () => {
  it('holds a batched schedule with no day or no time', () => {
    expect(canSaveDeliverySchedule(schedule({ deliveryDays: [] }))).toBe(false);
    expect(canSaveDeliverySchedule(schedule({ deliveryTimes: [] }))).toBe(false);
    expect(canSaveDeliverySchedule(schedule())).toBe(true);
  });

  it('allows Always on without days or times', () => {
    expect(canSaveDeliverySchedule(schedule({ isEnabled: false, deliveryDays: [] }))).toBe(true);
  });
});
