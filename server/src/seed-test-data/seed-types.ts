export type PersonaKey = "product-manager" | "founder" | "engineering-manager";

export const PERSONA_KEYS: PersonaKey[] = [
  "product-manager",
  "founder",
  "engineering-manager",
];

export type PriorityBand = "high" | "medium" | "low";

/** A single seeded email. `categorySlug` must match a {@link PersonaCategory} slug, or be "other" (null categoryId). */
export interface SeedEmailSpec {
  fromName: string;
  fromEmail: string;
  subject: string;
  categorySlug: string;
  band: PriorityBand;
  /** Pre-generated AI summary — every seeded email has one. */
  summary: string;
  /** Full body — only the top-priority emails carry one; others render summary-only. */
  body?: string;
  /** 0 = triage (default), 1-3 = action. */
  starCount?: number;
  /** When true the thread reads as awaiting-reply: starred + latest email sent by the tester. */
  isFollowUp?: boolean;
  isRead?: boolean;
}

/** A named inbox category for a persona. Seeded as a UserContext(EMAIL_CATEGORY). */
export interface PersonaCategory {
  slug: string;
  /** Emoji-prefixed display name, e.g. "🛠️ Product & Roadmap". */
  name: string;
  description: string;
}

export interface PersonaDataset {
  key: PersonaKey;
  label: string;
  /** Named categories (the "other" bucket is implicit — slug "other" → null categoryId). */
  categories: PersonaCategory[];
  /** Exactly 150 emails. */
  emails: SeedEmailSpec[];
}

/** Sentinel category slug that maps to a null categoryId (the inbox "Other" bucket). */
export const OTHER_CATEGORY_SLUG = "other";
