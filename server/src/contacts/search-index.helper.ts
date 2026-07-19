import * as crypto from "crypto";

import { QUERY_LIMITS } from "../constants/query-limits";

/** Sliding-window size for fuzzy-match trigrams. */
const TRIGRAM_LENGTH = 3;

/**
 * Helper for creating searchable blind indexes.
 *
 * This enables searching encrypted data without decrypting everything:
 * 1. Generate search tokens from plaintext (trigrams, normalized terms)
 * 2. Hash each token with SHA-256
 * 3. Store hashed tokens alongside encrypted data
 * 4. To search: hash the query tokens and match against stored hashes
 */
export class SearchIndexHelper {
  /**
   * Generate a deterministic hash for exact matching
   */
  static hashExact(value: string): string {
    if (!value) return "";
    return crypto
      .createHash("sha256")
      .update(value.toLowerCase().trim())
      .digest("hex");
  }

  /**
   * Generate search tokens for fuzzy matching.
   * Creates trigrams and word tokens, then hashes each.
   *
   * Example: "John Smith" -> trigrams: ["joh", "ohn", "hn ", "n s", " sm", "smi", "mit", "ith"]
   *                       -> words: ["john", "smith"]
   */
  static generateSearchTokens(
    ...values: (string | undefined | null)[]
  ): string[] {
    const tokens = new Set<string>();

    for (const value of values) {
      if (!value) continue;

      const normalized = value.toLowerCase().trim();

      // Add full normalized value
      tokens.add(this.hashToken(normalized));

      // Add individual words
      const words = normalized.split(/\s+/).filter((word) => word.length > 0);
      for (const word of words) {
        tokens.add(this.hashToken(word));

        // Add prefixes (for autocomplete-style search)
        for (let i = 2; i <= Math.min(word.length, 10); i++) {
          tokens.add(this.hashToken(word.substring(0, i)));
        }
      }

      // Add trigrams for fuzzy matching
      const trigrams = this.generateTrigrams(normalized);
      for (const trigram of trigrams) {
        tokens.add(this.hashToken(trigram));
      }
    }

    return Array.from(tokens);
  }

  /**
   * Generate interior trigrams (3-character sliding windows) from a string.
   *
   * We deliberately do NOT pad the string with whitespace. Space-padded edge
   * grams like "  k" or "os " collapse to a 1–2 character signal — effectively
   * "name starts with k" / "ends with s" — that matches almost every contact.
   * On the query side they exploded the candidate set into hundreds of weak
   * one-token matches and buried genuine matches (#2030). Prefix matching is
   * already covered precisely by the word-prefix tokens, so the edge grams
   * added noise without adding precision.
   *
   * Trigrams that span a word boundary (i.e. contain whitespace) are skipped —
   * they aren't a meaningful substring of any single term. Words shorter than
   * 3 characters yield no trigram and rely on the word/prefix tokens instead.
   */
  private static generateTrigrams(text: string): string[] {
    const trigrams: string[] = [];

    for (let i = 0; i + TRIGRAM_LENGTH <= text.length; i++) {
      const trigram = text.substring(i, i + TRIGRAM_LENGTH);
      if (!/\s/.test(trigram)) {
        trigrams.push(trigram);
      }
    }

    return trigrams;
  }

  /**
   * Hash a single token
   */
  private static hashToken(token: string): string {
    return (
      crypto
        .createHash("sha256")
        .update(token)
        .digest("hex")
        // Truncate to 16 chars to save space (still plenty of entropy)
        .substring(0, QUERY_LIMITS.SEARCH_INDEX_TRIGRAM_PAD)
    );
  }

  /**
   * Generate search query tokens (for matching against stored tokens)
   * Similar to generateSearchTokens but optimized for queries
   */
  static generateQueryTokens(query: string): string[] {
    if (!query) return [];

    const tokens = new Set<string>();
    const normalized = query.toLowerCase().trim();

    // Add full query
    tokens.add(this.hashToken(normalized));

    // Add individual words
    const words = normalized.split(/\s+/).filter((word) => word.length > 0);
    for (const word of words) {
      tokens.add(this.hashToken(word));

      // Add prefixes for partial matching
      for (let i = 2; i <= Math.min(word.length, 10); i++) {
        tokens.add(this.hashToken(word.substring(0, i)));
      }
    }

    // Add trigrams
    const trigrams = this.generateTrigrams(normalized);
    for (const trigram of trigrams) {
      tokens.add(this.hashToken(trigram));
    }

    return Array.from(tokens);
  }

  /**
   * Builds the SQL fragments for a blind-index token match against the
   * `contact.searchTokens` column — the OR clause that defines candidates and
   * the relevance-score expression (count of matched query tokens). Shared
   * bind params keep the OR clause and the score expression referencing the
   * same `:tokenN` values. Single source of truth for both production search
   * (`ContactsService.searchContacts`) and the admin diagnostic
   * (`ContactsDebugAdminService.diagnoseSearch`).
   */
  static buildTokenMatchSql(tokenHashes: string[]): {
    tokenParams: Record<string, string>;
    orClause: string;
    matchScoreExpr: string;
  } {
    const tokenParams: Record<string, string> = {};
    const likeClauses: string[] = [];
    const scoreClauses: string[] = [];
    tokenHashes.forEach((token, i) => {
      tokenParams[`token${i}`] = `%${token}%`;
      likeClauses.push(`contact.searchTokens LIKE :token${i}`);
      scoreClauses.push(
        `(CASE WHEN contact.searchTokens LIKE :token${i} THEN 1 ELSE 0 END)`,
      );
    });
    return {
      tokenParams,
      orClause: likeClauses.join(" OR "),
      matchScoreExpr: scoreClauses.join(" + "),
    };
  }

  /**
   * Extract email domain for indexing
   */
  static extractEmailDomain(email: string): string | null {
    if (!email) return null;
    const parts = email.split("@");
    return parts.length > 1 ? parts[1].toLowerCase() : null;
  }

  /**
   * Extract email local part for indexing
   */
  static extractEmailLocalPart(email: string): string | null {
    if (!email) return null;
    const parts = email.split("@");
    return parts.length > 0 ? parts[0].toLowerCase() : null;
  }
}
