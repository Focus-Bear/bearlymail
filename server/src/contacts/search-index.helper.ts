import * as crypto from "crypto";
import { QUERY_LIMITS } from "../constants/query-limits";

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
      const words = normalized.split(/\s+/).filter((w) => w.length > 0);
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
   * Generate trigrams from a string
   */
  private static generateTrigrams(text: string): string[] {
    const trigrams: string[] = [];
    // Pad for edge trigrams
    const padded = `  ${text}  `;

    for (let i = 0; i < padded.length - 2; i++) {
      const trigram = padded.substring(i, i + 3);
      if (trigram.trim().length > 0) {
        // Skip whitespace-only trigrams
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
    const words = normalized.split(/\s+/).filter((w) => w.length > 0);
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
