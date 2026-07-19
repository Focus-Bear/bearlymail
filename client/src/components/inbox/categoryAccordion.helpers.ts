/**
 * Pure helper functions extracted from CategoryAccordion.tsx for testability.
 * Issue #769 — backfill unit tests for frontend business logic helpers
 */
import {
  CATEGORY_CUSTOMER_SUPPORT,
  CATEGORY_DANGEROUS_PHISHING,
  CATEGORY_HR_ADMIN,
  CATEGORY_NEWSLETTERS,
  CATEGORY_OTHER,
  CATEGORY_PARTNERSHIPS,
  CATEGORY_SALES,
  KEY_ESCAPE,
  KEY_Y,
} from 'constants/strings';

export const DEFAULT_CATEGORY_TRANSLATIONS: Record<string, string> = {
  [CATEGORY_NEWSLETTERS]: 'inbox.category.newsletters',
  [CATEGORY_SALES]: 'inbox.category.sales',
  [CATEGORY_PARTNERSHIPS]: 'inbox.category.partnerships',
  [CATEGORY_CUSTOMER_SUPPORT]: 'inbox.category.customerSupport',
  [CATEGORY_HR_ADMIN]: 'inbox.category.hrAdmin',
  [CATEGORY_OTHER]: 'inbox.category.other',
  [CATEGORY_DANGEROUS_PHISHING]: 'inbox.category.dangerousPhishing',
};

export function isDefaultCategory(category: string): boolean {
  return category in DEFAULT_CATEGORY_TRANSLATIONS;
}

export function getCategoryTranslationKey(category: string): string | null {
  return DEFAULT_CATEGORY_TRANSLATIONS[category] || null;
}

export function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    [CATEGORY_NEWSLETTERS]: '📰',
    [CATEGORY_SALES]: '💼',
    [CATEGORY_PARTNERSHIPS]: '🤝',
    [CATEGORY_CUSTOMER_SUPPORT]: '🎧',
    [CATEGORY_HR_ADMIN]: '📋',
    [CATEGORY_OTHER]: '📧',
    [CATEGORY_DANGEROUS_PHISHING]: '🛑',
  };
  return icons[category] || '📧';
}

export function makeArchiveKeyDownHandler(onConfirm: () => void, onCancel: () => void): (event: KeyboardEvent) => void {
  return (event: KeyboardEvent) => {
    if (event.key.toLowerCase() === KEY_Y) {
      event.stopPropagation();
      onConfirm();
    } else if (event.key === KEY_ESCAPE) {
      event.stopPropagation();
      onCancel();
    }
  };
}
