import { Injectable, Logger } from "@nestjs/common";

import { CATEGORY_RESERVED_NAMES } from "../constants/domain-types";
import {
  domainMatchesAny,
  PLATFORM_PINNING,
} from "../constants/platform-pinning.constants";
import { cosineSimilarity, EmbeddingService } from "./embedding.service";

// Re-exported from the shared registry so existing importers keep working while
// the single source of truth lives in `constants/platform-pinning.constants.ts`.
export {
  GITHUB_SENDER_DOMAINS,
  isGithubSenderEmail,
  PLATFORM_PINNING,
} from "../constants/platform-pinning.constants";

/**
 * Default cap on how many categories to send to the model. Infinite by design:
 * we send ALL categories, ranked by embedding similarity (best match first),
 * rather than truncating to a top-N. Truncation caused recall misses — an email
 * that embedded closer to unrelated categories (e.g. a security-scanner digest
 * ranking below GitHub categories) never had its true category shown to the
 * model, so it invented a proto instead of matching (e.g. "🔒 Security &
 * Compliance"). Ranking still helps the model; recall is no longer sacrificed.
 * `topN` remains a caller-supplied optional cap.
 */
const DEFAULT_TOP_N = Number.POSITIVE_INFINITY;

/**
 * Minimum category count before the embedding rerank is worth running. Below
 * this the list is short enough to send as-is (no embedding cost); above it we
 * embed + rank all categories best-first.
 */
const SHORTLIST_THRESHOLD = 12;

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
      if (domainMatchesAny(domain, entry.domainPatterns)) {
        return entry.categoryKeywords;
      }
    }
    return [];
  }

  /** Dedupe key for a category: its stable key, else its (lower-cased) name. */
  private dedupeKey(cat: CategoryItem): string {
    return (cat.categoryKey ?? cat.name).toLowerCase();
  }

  /**
   * Dedupe keys of every category the sender's platform guarantees into the
   * shortlist (e.g. all "github" categories for a github.com sender), excluding
   * "Other". Empty for non-platform senders. These are the categories flagged
   * `pinned` in the provenance — guaranteed present regardless of embedding rank.
   */
  private getPlatformCategoryKeys(
    allCategories: CategoryItem[],
    fromEmail: string,
  ): Set<string> {
    const keywords = this.getPlatformKeywordsForSender(fromEmail);
    if (keywords.length === 0) return new Set();
    const keys = new Set<string>();
    for (const cat of allCategories) {
      if (cat.name.toLowerCase() === CATEGORY_RESERVED_NAMES.OTHER) continue;
      const nameWithoutEmoji = cat.name
        .toLowerCase()
        .replace(/\p{Emoji}/gu, "")
        .trim();
      if (keywords.some((kw) => nameWithoutEmoji.includes(kw))) {
        keys.add(this.dedupeKey(cat));
      }
    }
    return keys;
  }

  /**
   * Appends any platform-specific categories that the embedding shortlist
   * omitted, so GitHub/Jira/etc. categories are always visible to the smart
   * model when the email is from that platform. The caller re-ranks the full
   * list by score afterwards, so these are not permanently stuck at the end.
   */
  pinPlatformCategories(
    shortlisted: CategoryItem[],
    allCategories: CategoryItem[],
    fromEmail: string,
  ): CategoryItem[] {
    const platformKeys = this.getPlatformCategoryKeys(allCategories, fromEmail);
    if (platformKeys.size === 0) return shortlisted;

    const shortlistedKeys = new Set(
      shortlisted.map((cat) => this.dedupeKey(cat)),
    );
    const missing = allCategories.filter((cat) => {
      const key = this.dedupeKey(cat);
      return platformKeys.has(key) && !shortlistedKeys.has(key);
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

      // Score EVERY shortlistable category once (not just the top-N) so that
      // platform-pinned categories — which may rank outside the top-N — still
      // carry a real cosine score for the final ranking below.
      const scoreByKey = new Map(
        shortlistableCategories.map((cat, i) => [
          this.dedupeKey(cat),
          cosineSimilarity(emailVector, categoryVectors[i]),
        ]),
      );
      const scoreFor = (cat: CategoryItem): number | null =>
        scoreByKey.get(this.dedupeKey(cat)) ?? null;
      const byScoreDesc = (left: CategoryItem, right: CategoryItem): number =>
        (scoreFor(right) ?? Number.NEGATIVE_INFINITY) -
        (scoreFor(left) ?? Number.NEGATIVE_INFINITY);

      // Rank ALL categories best-first and send them all (topN defaults to
      // Infinity — see DEFAULT_TOP_N). The slice only bites when a caller passes
      // an explicit cap; by default nothing is dropped, so the correct category
      // is always in the list the model sees.
      const ranked = [...shortlistableCategories]
        .sort(byScoreDesc)
        .slice(0, topN);

      if (ranked.length === 0) {
        return { effective: allCategories, candidates: [] };
      }

      // Guarantee platform categories are present (GitHub for GitHub senders,
      // etc.), then rank the FULL effective list — embedding hits AND platform
      // pins — by cosine similarity descending. Pins are placed by likelihood
      // (a high-relevance pin outranks a low-relevance hit), not appended last.
      const effective = this.pinPlatformCategories(
        ranked,
        allCategories,
        email.from,
      ).sort(byScoreDesc);

      // `pinned` = the sender's platform guaranteed this category into the list
      // (whether or not it also made the embedding top-N). Both pins and hits
      // now carry their real cosine score.
      const platformKeys = this.getPlatformCategoryKeys(
        allCategories,
        email.from,
      );
      const candidates: ShortlistCandidate[] = effective.map((cat) => ({
        name: cat.name,
        score: scoreFor(cat),
        pinned: platformKeys.has(this.dedupeKey(cat)),
      }));

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
