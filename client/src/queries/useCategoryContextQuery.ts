/**
 * useCategoryContextQuery — fetches all user-defined categories from GET /context.
 *
 * Unlike useInboxSummaryQuery (which only returns categories that currently have
 * emails in the inbox), this hook returns every EMAIL_CATEGORY the user has ever
 * defined — including empty categories. That makes it the correct data source for
 * the CategoryOverrideModal dropdown.
 *
 * Introduced in: fix #1386 — CategoryOverrideModal category loading rework
 */

import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

import { API_URL } from 'config/api';
import { CONTEXT_KEY_EMAIL_CATEGORY } from 'constants/strings';

import { STALE_TIME_5_MIN } from './constants';

// Shape of a UserContext item returned by GET /context
export interface UserContextItem {
  contextId: string;
  contextKey: string;
  contextValue: string;
}

export interface CategoryOption {
  id: string;
  name: string;
}

// Safe delimiter used to separate category name from description in contextValue.
// Must not appear in user-defined category names.
const CONTEXT_VALUE_DELIMITER = ' - ';

async function fetchCategoryContext(): Promise<CategoryOption[]> {
  const response = await axios.get<UserContextItem[]>(`${API_URL}/context`);
  return (
    response.data
      .filter(ctx => ctx.contextKey === CONTEXT_KEY_EMAIL_CATEGORY)
      // Parse name: contextValue format is "CategoryName - optional description"
      .map(ctx => ({
        id: ctx.contextId,
        name: ctx.contextValue.split(CONTEXT_VALUE_DELIMITER)[0].trim(),
      }))
      // Remove blank names (malformed entries)
      .filter(cat => cat.name !== '')
      // Deduplicate by name
      .filter((cat, index, all) => all.findIndex(other => other.name === cat.name) === index)
      .sort((catA, catB) => catA.name.localeCompare(catB.name))
  );
}

/**
 * Returns all user-defined EMAIL_CATEGORY context entries.
 * 5-minute stale time — categories change infrequently.
 */
export function useCategoryContextQuery() {
  return useQuery({
    queryKey: ['category-context'] as const,
    queryFn: fetchCategoryContext,
    staleTime: STALE_TIME_5_MIN,
  });
}
