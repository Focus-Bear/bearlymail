const HOUR_6PM = 18;
const HOUR_NOON = 12;
const HOUR_1PM = 13;
const HOUR_8AM = 8;
const DAY_SATURDAY = 6;
const DAY_SUNDAY = 0;
const DAY_MONDAY = 1;

export interface ScheduleSuggestion {
  labelKey: string;
  sublabel: string;
  date: Date;
}

export const formatSuggestionDate = (date: Date): string =>
  date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

const nextMondayMorning = (now: Date): Date => {
  const dow = now.getDay();
  const daysUntilMonday = dow === DAY_MONDAY ? 7 : (DAY_MONDAY - dow + 7) % 7;
  const result = new Date(now);
  result.setDate(now.getDate() + daysUntilMonday);
  result.setHours(HOUR_8AM, 0, 0, 0);
  return result;
};

const nextWeekdayMorning = (now: Date): Date => {
  const result = new Date(now);
  result.setDate(now.getDate() + 1);
  if (result.getDay() === DAY_SATURDAY) {
    result.setDate(result.getDate() + 2);
  } else if (result.getDay() === DAY_SUNDAY) {
    result.setDate(result.getDate() + 1);
  }
  result.setHours(HOUR_8AM, 0, 0, 0);
  return result;
};

const thisAfternoon = (now: Date): Date => {
  const result = new Date(now);
  result.setHours(HOUR_1PM, 0, 0, 0);
  return result;
};

/**
 * Returns smart schedule suggestions based on the current time-of-day / day-of-week,
 * matching Gmail's approach:
 *   - Late evening (≥18:00)      → Tomorrow morning
 *   - Weekend                    → Monday morning
 *   - Weekday morning (<12:00)   → This afternoon + Tomorrow morning
 *   - Weekday afternoon          → Tomorrow morning
 */
export const getScheduleSuggestions = (now: Date = new Date()): ScheduleSuggestion[] => {
  const hour = now.getHours();
  const dow = now.getDay();

  const isWeekend = dow === DAY_SATURDAY || dow === DAY_SUNDAY;
  const isLateEvening = hour >= HOUR_6PM;
  const isMorning = hour < HOUR_NOON;

  if (isWeekend) {
    const date = nextMondayMorning(now);
    return [{ labelKey: 'mondayMorning', sublabel: formatSuggestionDate(date), date }];
  }
  if (isLateEvening) {
    const date = nextWeekdayMorning(now);
    return [{ labelKey: 'tomorrowMorning', sublabel: formatSuggestionDate(date), date }];
  }
  if (isMorning) {
    const afternoon = thisAfternoon(now);
    const tomorrow = nextWeekdayMorning(now);
    return [
      { labelKey: 'thisAfternoon', sublabel: formatSuggestionDate(afternoon), date: afternoon },
      { labelKey: 'tomorrowMorning', sublabel: formatSuggestionDate(tomorrow), date: tomorrow },
    ];
  }
  const date = nextWeekdayMorning(now);
  return [{ labelKey: 'tomorrowMorning', sublabel: formatSuggestionDate(date), date }];
};
