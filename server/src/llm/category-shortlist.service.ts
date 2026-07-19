import { Injectable, Logger } from "@nestjs/common";

import { CATEGORY_RESERVED_NAMES } from "../constants/domain-types";
import { cosineSimilarity, EmbeddingService } from "./embedding.service";

/** Default number of categories to shortlist. */
const DEFAULT_TOP_N = 10;

/** Minimum category count before shortlisting is worth running. */
const SHORTLIST_THRESHOLD = 12;

/**
 * Platform keyword pinning: when the sender's email domain matches a known
 * platform, all categories containing that platform's keyword are pinned into
 * the shortlist regardless of what the cheap shortlist model selected.
 *
 * This prevents GitHub emails from being labelled "Other" (and triggering a
 * redundant "Github and Code" proto-category) simply because the shortlist
 * model failed to surface the user's existing GitHub-specific categories.
 */
export const PLATFORM_PINNING: Array<{
  domainPatterns: string[];
  categoryKeywords: string[];
}> = [
  { domainPatterns: ["github.com", "github.io"], categoryKeywords: ["github"] },
  {
    domainPatterns: ["gitlab.com", "gitlab.io"],
    categoryKeywords: ["gitlab"],
  },
  {
    domainPatterns: ["atlassian.net", "atlassian.com"],
    categoryKeywords: ["jira", "atlassian", "confluence"],
  },
  {
    domainPatterns: ["linear.app"],
    categoryKeywords: ["linear"],
  },
  {
    domainPatterns: ["slack.com"],
    categoryKeywords: ["slack"],
  },
  {
    domainPatterns: ["notion.so", "notion.com"],
    categoryKeywords: ["notion"],
  },
  {
    domainPatterns: ["figma.com"],
    categoryKeywords: ["figma"],
  },
  {
    domainPatterns: ["sentry.io"],
    categoryKeywords: ["sentry"],
  },
  {
    domainPatterns: ["pagerduty.com"],
    categoryKeywords: ["pagerduty"],
  },
  {
    domainPatterns: ["datadog.com"],
    categoryKeywords: ["datadog"],
  },
];

export type CategoryItem = {
  name: string;
  description?: string;
  /** Stable id for LLM output (DB slug or synthetic proto id). */
  categoryKey?: string;
};

/**
 * One category the smart model was shown, with how it got there — for
 * instrumentation. `score` is the email↔category cosine similarity for
 * embedding-ranked entries, or null for platform-pinned entries (added
 * regardless of score). `pinned` flags platform-keyword pins. Lets us see, per
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

/**
 * CategoryShortlistService — Step 1 of the two-step category analysis.
 *
 * Pre-filters the full category list down to the top-N most relevant candidates
 * using embedding cosine similarity (no chat-model call). The smart model in
 * Step 2 (PriorityAnalysisService) then only needs to reason over a short list,
 * reducing token usage substantially for power users.
 *
 * Category embeddings are cached in-memory (categories rarely change); only the
 * small email text is embedded per call. "Other" is deliberately excluded from
 * the shortlist; the smart model decides if "Other" applies.
 *
 * Always active when the category count exceeds the threshold.
 * Falls back to the full list if embeddings are unavailable or fail.
 */
@Injectable()
export class CategoryShortlistService {
  private readonly logger = new Logger(CategoryShortlistService.name);

  constructor(private readonly embeddingService: EmbeddingService) {}

  /** Text used to embed a category: name plus optional description. */
  private categoryText(cat: CategoryItem): string {
    return cat.description ? `${cat.name}: ${cat.description}` : cat.name;
  }

  /** Text used to embed an email for category matching. */
  private emailText(email: {
    from: string;
    fromName?: string;
    subject: string;
    summary: string;
  }): string {
    return `From: ${email.fromName || email.from}\nSubject: ${email.subject}\n${email.summary}`;
  }

  /**
   * Returns true when shortlisting should be applied:
   * - The total number of categories exceeds the threshold.
   */
  isShortlistEnabled(totalCategoryCount: number): boolean {
    return totalCategoryCount > SHORTLIST_THRESHOLD;
  }

  /**
   * Returns platform keywords to pin when the sender's email matches a known
   * platform domain. Returns an empty array for unrecognised senders.
   */
  getPlatformKeywordsForSender(fromEmail: string): string[] {
    const lower = fromEmail.toLowerCase();
    const domain = lower.split("@")[1];
    if (!domain) return [];

    for (const entry of PLATFORM_PINNING) {
      if (
        entry.domainPatterns.some(
          (pattern) => domain === pattern || domain.endsWith(`.${pattern}`),
        )
      ) {
        return entry.categoryKeywords;
      }
    }
    return [];
  }

  /**
   * Appends any platform-specific categories that the LLM shortlist omitted.
   * Called after parsing the LLM response so that GitHub/Jira/etc. categories
   * are always visible to the smart model when the email is from that platform.
   */
  pinPlatformCategories(
    shortlisted: CategoryItem[],
    allCategories: CategoryItem[],
    fromEmail: string,
  ): CategoryItem[] {
    const keywords = this.getPlatformKeywordsForSender(fromEmail);
    if (keywords.length === 0) return shortlisted;

    const shortlistedKeys = new Set(
      shortlisted.map((cat) => (cat.categoryKey ?? cat.name).toLowerCase()),
    );

    const missing = allCategories.filter((cat) => {
      if (cat.name.toLowerCase() === CATEGORY_RESERVED_NAMES.OTHER)
        return false;
      const dedupeKey = (cat.categoryKey ?? cat.name).toLowerCase();
      if (shortlistedKeys.has(dedupeKey)) return false;
      const nameWithoutEmoji = cat.name
        .toLowerCase()
        .replace(/\p{Emoji}/gu, "")
        .trim();
      return keywords.some((kw) => nameWithoutEmoji.includes(kw));
    });

    if (missing.length === 0) return shortlisted;

    this.logger.log(
      `CategoryShortlist: pinning ${missing.length} platform categor${missing.length === 1 ? "y" : "ies"} for sender "${fromEmail}": ${missing.map((cat) => cat.name).join(", ")}`,
    );
    return [...shortlisted, ...missing];
  }

  /**
   * Return the top-N most relevant categories for a given email, ranked by
   * embedding cosine similarity between the email and each category.
   *
   * Takes the email SUMMARY (pre-computed by the caller) rather than the raw
   * body — the shortlist is a cheap pre-filter that doesn't need full content.
   *
   * Returns a filtered list WITHOUT "Other". The smart model in Step 2 decides
   * whether "Other" is the right choice if none of the shortlisted categories fit.
   *
   * Falls back to `allCategories` if embeddings are unavailable or fail.
   */
  async getShortlist(
    email: {
      from: string;
      fromName?: string;
      subject: string;
      summary: string;
    },
    allCategories: CategoryItem[],
    topN: number = DEFAULT_TOP_N,
  ): Promise<CategoryItem[]> {
    return (await this.getShortlistWithMeta(email, allCategories, topN))
      .effective;
  }

  /**
   * Like {@link getShortlist}, but also returns per-candidate provenance
   * (embedding score + whether it was platform-pinned) for instrumentation.
   * When shortlisting falls back to the full list (no embeddings / empty),
   * `candidates` is empty since no scoring was performed.
   */
  async getShortlistWithMeta(
    email: {
      from: string;
      fromName?: string;
      subject: string;
      summary: string;
    },
    allCategories: CategoryItem[],
    topN: number = DEFAULT_TOP_N,
  ): Promise<ShortlistResult> {
    if (allCategories.length === 0) {
      return { effective: allCategories, candidates: [] };
    }

    if (!this.embeddingService.isAvailable()) {
      this.logger.warn(
        "CategoryShortlistService: embeddings unavailable — falling back to full category list",
      );
      return { effective: allCategories, candidates: [] };
    }

    // Exclude "Other" from the shortlist input — the smart model handles that
    const shortlistableCategories = allCategories.filter(
      (cat) => cat.name.toLowerCase() !== CATEGORY_RESERVED_NAMES.OTHER,
    );
    if (shortlistableCategories.length === 0) {
      return { effective: allCategories, candidates: [] };
    }

    try {
      const [categoryVectors, emailVectors] = await Promise.all([
        this.embeddingService.embed(
          shortlistableCategories.map((cat) => this.categoryText(cat)),
          { cache: true },
        ),
        this.embeddingService.embed([this.emailText(email)]),
      ]);
      const emailVector = emailVectors[0];

      const rankedEntries = shortlistableCategories
        .map((cat, i) => ({
          cat,
          score: cosineSimilarity(emailVector, categoryVectors[i]),
        }))
        .sort((left, right) => right.score - left.score)
        .slice(0, topN);
      const ranked = rankedEntries.map((entry) => entry.cat);

      if (ranked.length === 0) {
        return { effective: allCategories, candidates: [] };
      }

      const effective = this.pinPlatformCategories(
        ranked,
        allCategories,
        email.from,
      );
      // Map the final effective list back to its provenance: embedding-ranked
      // entries carry their score; platform-pinned additions get score=null.
      const scoreByKey = new Map(
        rankedEntries.map((entry) => [
          (entry.cat.categoryKey ?? entry.cat.name).toLowerCase(),
          entry.score,
        ]),
      );
      const candidates: ShortlistCandidate[] = effective.map((cat) => {
        const key = (cat.categoryKey ?? cat.name).toLowerCase();
        const score = scoreByKey.get(key);
        return { name: cat.name, score: score ?? null, pinned: score == null };
      });

      return { effective, candidates };
    } catch (error) {
      this.logger.error(
        "CategoryShortlistService: embedding shortlist failed — falling back to full category list",
        error,
      );
      return { effective: allCategories, candidates: [] };
    }
  }
}
