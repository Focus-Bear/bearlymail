/** A category the categoriser can choose: a real user category or a proto. */
export type CategoryItem = {
  name: string;
  description?: string;
  /** Stable id for LLM output (DB slug or synthetic proto id). */
  categoryKey?: string;
};

/**
 * One category the smart model was shown, with how it got there — for
 * instrumentation. `score` is the email↔category cosine similarity; both
 * embedding-ranked AND platform-pinned entries now carry their real score, and
 * the whole list is sorted by score (a pin is scored and placed by likelihood,
 * not dumped at the bottom). `score` is only null in the rare case a category
 * was not in the score map. `pinned` flags categories the sender's platform
 * guaranteed into the shortlist (e.g. GitHub categories for a github.com
 * sender), whether or not they also made the embedding top-N. Lets us see, per
 * email, whether the *right* category was even a candidate or got crowded out.
 */
export type ShortlistCandidate = {
  name: string;
  score: number | null;
  pinned: boolean;
};

export type ShortlistResult = {
  /** The category list actually passed to the smart model. */
  effective: CategoryItem[];
  /** The same categories with score/pinned provenance, for debug instrumentation. */
  candidates: ShortlistCandidate[];
};

/** Narrows a large category list to the candidates worth sending to the model. */
export interface CategoryShortlister {
  isShortlistEnabled(totalCategoryCount: number): boolean;
  getShortlistWithMeta(
    email: {
      from: string;
      fromName?: string;
      subject: string;
      summary: string;
    },
    allCategories: CategoryItem[],
  ): Promise<ShortlistResult>;
}
