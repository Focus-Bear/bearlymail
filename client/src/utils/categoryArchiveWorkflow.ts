import axios from 'axios';

import { API_URL } from 'config/api';

import { WorkflowCondition } from '../components/settings/workflows/types';

/**
 * The user's response to the "auto-archive this category?" suggestion. Recorded
 * server-side so we stop suggesting once they've decided.
 */
export type CategoryArchiveSuggestionResponse = 'accepted' | 'dismissed';

/** A category the user is being nudged to auto-archive. */
export interface CategoryArchiveSuggestion {
  categoryId: string;
  categoryName: string;
}

/**
 * Create a workflow that automatically archives every email tagged with the
 * given category. Scopes the rule via `condition.categories` (the category's
 * UserContext id) and uses the new `archive` action.
 */
export async function createCategoryArchiveWorkflow(
  categoryId: string,
  workflowName: string
): Promise<void> {
  const condition: WorkflowCondition = {
    fromPatterns: [],
    subjectPatterns: [],
    categories: [categoryId],
    priorityLevels: [],
    naturalLanguageCondition: null,
  };
  await axios.post(`${API_URL}/workflows`, {
    name: workflowName,
    enabled: true,
    condition,
    actions: [{ type: 'archive', label: '' }],
  });
}

/** Record whether the user accepted or dismissed the auto-archive suggestion. */
export async function respondToCategoryArchiveSuggestion(
  categoryId: string,
  response: CategoryArchiveSuggestionResponse
): Promise<void> {
  await axios.post(`${API_URL}/category-workflows/${categoryId}/suggestion-response`, { response });
}
