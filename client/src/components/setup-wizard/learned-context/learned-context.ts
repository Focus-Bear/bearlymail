import {
  CONTEXT_KEY_EMAIL_CATEGORY,
  CONTEXT_KEY_MY_GOALS,
  CONTEXT_KEY_URGENT,
  CONTEXT_KEY_VIP_CONTACT,
  CONTEXT_KEY_WORKING_ON,
} from 'constants/strings';

export interface LearnedContextItem {
  contextId: string;
  contextKey: string;
  contextValue: string;
  source?: string;
  /** Stable React key for items added in this session, so swapping in the server id doesn't remount them. */
  clientKey?: string;
}

export const LEARNED_GROUP_IMPORTANT = 'important';
export const LEARNED_GROUP_PROJECTS = 'projects';
export const LEARNED_GROUP_CATEGORIES = 'categories';

export type LearnedGroupId =
  | typeof LEARNED_GROUP_IMPORTANT
  | typeof LEARNED_GROUP_PROJECTS
  | typeof LEARNED_GROUP_CATEGORIES;

export interface LearnedGroupConfig {
  id: LearnedGroupId;
  icon: string;
  /** Context keys shown in this group, in display order. */
  keys: readonly string[];
}

export const LEARNED_GROUPS: readonly LearnedGroupConfig[] = [
  {
    id: LEARNED_GROUP_IMPORTANT,
    icon: '⭐',
    // A new item defaults to the first key (a goal); the others are offered as alternatives.
    keys: [CONTEXT_KEY_MY_GOALS, CONTEXT_KEY_VIP_CONTACT, CONTEXT_KEY_URGENT],
  },
  { id: LEARNED_GROUP_PROJECTS, icon: '🛠️', keys: [CONTEXT_KEY_WORKING_ON] },
  { id: LEARNED_GROUP_CATEGORIES, icon: '🗂️', keys: [CONTEXT_KEY_EMAIL_CATEGORY] },
];

/** Separates a category's display name from its description in `contextValue`. */
const CATEGORY_VALUE_DELIMITER = ' - ';

export interface LearnedItemParts {
  label: string;
  /** Category description kept out of the editable label so renames don't drop it. */
  detail: string | null;
}

function isCategory(contextKey: string): boolean {
  return contextKey === CONTEXT_KEY_EMAIL_CATEGORY;
}

export function splitContextValue(item: Pick<LearnedContextItem, 'contextKey' | 'contextValue'>): LearnedItemParts {
  if (!isCategory(item.contextKey)) {
    return { label: item.contextValue, detail: null };
  }
  const delimiterIndex = item.contextValue.indexOf(CATEGORY_VALUE_DELIMITER);
  if (delimiterIndex === -1) {
    return { label: item.contextValue, detail: null };
  }
  return {
    label: item.contextValue.slice(0, delimiterIndex).trim(),
    detail: item.contextValue.slice(delimiterIndex + CATEGORY_VALUE_DELIMITER.length).trim() || null,
  };
}

/** Rebuilds `contextValue` from an edited label, preserving a category's description. */
export function joinContextValue(label: string, detail: string | null): string {
  const trimmedLabel = label.trim();
  return detail ? `${trimmedLabel}${CATEGORY_VALUE_DELIMITER}${detail}` : trimmedLabel;
}

/** Buckets context rows into the onboarding groups, ordered by each group's key order. */
export function groupLearnedContext(items: readonly LearnedContextItem[]): Record<LearnedGroupId, LearnedContextItem[]> {
  const grouped = {} as Record<LearnedGroupId, LearnedContextItem[]>;
  for (const group of LEARNED_GROUPS) {
    grouped[group.id] = group.keys.flatMap(key => items.filter(item => item.contextKey === key));
  }
  return grouped;
}

export function isLearnedContextItemList(value: unknown): value is LearnedContextItem[] {
  return (
    Array.isArray(value) &&
    value.every(
      item =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as Record<string, unknown>).contextId === 'string' &&
        typeof (item as Record<string, unknown>).contextKey === 'string' &&
        typeof (item as Record<string, unknown>).contextValue === 'string'
    )
  );
}
