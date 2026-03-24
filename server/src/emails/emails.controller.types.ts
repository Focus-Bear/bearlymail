export type CategoryOverrideBody = {
  categoryId?: string;
  categoryName?: string;
  category?: string;
  reason?: string;
};

export type InboxQuery = {
  includeBatched?: string;
  mode?: "triage" | "action" | "follow-up" | "blocked";
  accounts?: string;
  categoryIds?: string;
  minPriority?: string;
  maxPriority?: string;
  page?: string;
  limit?: string;
  offset?: string;
};
// max-params fixed
