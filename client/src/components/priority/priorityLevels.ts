import { theme } from 'theme/theme';

/**
 * The three priority levels, shared by every priority control (the inbox-list inline
 * selector and the open-email dropdown chip). `value` maps onto the `starCount` model
 * (1 = Can wait, 2 = Get on it, 3 = Oh sh$t); 0 means "not prioritized".
 */
export interface PriorityLevelDef {
  value: number;
  emoji: string;
  /** i18n key for the short label, e.g. "Get on it". */
  labelKey: string;
  /** i18n key for the one-line effect description, e.g. "Bumped up your list". */
  hintKey: string;
  /** Theme colour used when the level is selected. */
  color: string;
}

export const PRIORITY_LEVELS: PriorityLevelDef[] = [
  {
    value: 1,
    emoji: '😊',
    labelKey: 'inbox.canWait',
    hintKey: 'inbox.priorityCanWaitHint',
    color: theme.colors.success.main,
  },
  {
    value: 2,
    emoji: '😀',
    labelKey: 'inbox.getOnIt',
    hintKey: 'inbox.priorityGetOnItHint',
    color: theme.colors.primary.main,
  },
  {
    value: 3,
    emoji: '🧨',
    labelKey: 'inbox.ohShit',
    hintKey: 'inbox.priorityOhShitHint',
    color: theme.colors.error.main,
  },
];

/** starCount is 0–3; clamp defensively so an out-of-range value degrades to the top level. */
export const selectedPriorityLevel = (starCount: number): PriorityLevelDef | null =>
  PRIORITY_LEVELS.find(level => level.value === Math.min(starCount, PRIORITY_LEVELS.length)) ?? null;
