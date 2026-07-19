export type UserContextInput = {
  urgentItems?: Array<{ value: string; explanation?: string }>;
  notUrgentItems?: Array<{ value: string; explanation?: string }>;
  goals?: Array<{ value: string; priority?: number }>;
  workingOn?: Array<{ value: string; priority?: number }>;
  dontCare?: Array<{ value: string }>;
  emailCategories?: Array<{
    name: string;
    description?: string;
    categoryKey?: string;
  }>;
  protoCategories?: Array<{
    name: string;
    description?: string;
    categoryKey?: string;
  }>;
};

export type UserContextTexts = {
  urgentContextText: string;
  notUrgentContextText: string;
  goalsContextText: string;
  workingOnContextText: string;
  dontCareContextText: string;
  emailCategoriesText: string;
};

/**
 * Render the user's learned context (urgent items, goals, categories, …) into
 * the plain-text blocks the priority prompt templates interpolate.
 */
export function buildUserContextTexts(
  userContext?: UserContextInput,
): UserContextTexts {
  const urgentContextText =
    userContext?.urgentItems && userContext.urgentItems.length > 0
      ? userContext.urgentItems
          .map(
            (item) =>
              `- ${item.value}${item.explanation ? ` (${item.explanation})` : ""}`,
          )
          .join("\n")
      : "";
  const notUrgentContextText =
    userContext?.notUrgentItems && userContext.notUrgentItems.length > 0
      ? userContext.notUrgentItems
          .map(
            (item) =>
              `- ${item.value}${item.explanation ? ` (${item.explanation})` : ""}`,
          )
          .join("\n")
      : "";
  const goalsContextText =
    userContext?.goals && userContext.goals.length > 0
      ? userContext.goals
          .map(
            (goal) =>
              `- ${goal.value}${goal.priority ? ` (Priority ${goal.priority})` : ""}`,
          )
          .join("\n")
      : "";
  const workingOnContextText =
    userContext?.workingOn && userContext.workingOn.length > 0
      ? userContext.workingOn
          .map(
            (item) =>
              `- ${item.value}${item.priority ? ` (Priority ${item.priority})` : ""}`,
          )
          .join("\n")
      : "";
  const dontCareContextText =
    userContext?.dontCare && userContext.dontCare.length > 0
      ? userContext.dontCare.map((item) => `- ${item.value}`).join("\n")
      : "";
  // Numbered list: the LLM returns the NUMBER (categoryNumber), resolved back
  // to the exact category by array index — no free-text name matching.
  const emailCategoriesText =
    userContext?.emailCategories && userContext.emailCategories.length > 0
      ? userContext.emailCategories
          .map(
            (cat, index) =>
              `   ${index + 1}. "${cat.name}"${cat.description ? `: ${cat.description}` : ""}`,
          )
          .join("\n")
      : "";
  return {
    urgentContextText,
    notUrgentContextText,
    goalsContextText,
    workingOnContextText,
    dontCareContextText,
    emailCategoriesText,
  };
}
