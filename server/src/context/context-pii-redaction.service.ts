import { Injectable } from "@nestjs/common";

import { RATIOS } from "../constants/percentages";

/**
 * Service for redacting PII (Personally Identifiable Information) from text.
 * Provides utilities for conservative name redaction and context value similarity checking.
 */
@Injectable()
export class ContextPiiRedactionService {
  /**
   * Redact PII from text, replacing with placeholders.
   * Handles: names, email addresses, phone numbers, bank details, addresses, SSN/ID numbers.
   *
   * High-confidence contexts for names:
   * - After greetings: "Hi John,", "Hello Sarah,"
   * - In signatures: "Best, John"
   * - Before verbs: "John said", "Sarah wrote"
   *
   * Does NOT redact common words like "campaign", "journey", "session" that appear in normal text.
   */
  redactPII(text: string, userEmail?: string): string {
    let redacted = this.redactStructuredPII(text, userEmail);

    const namesToRedact = this.collectNamesToRedact(redacted);

    // Replace identified names with [Name] placeholder
    for (const name of namesToRedact) {
      // Use word boundaries to avoid partial matches. Escape the name first: it is
      // derived from email content, so unescaped regex metacharacters would be a
      // regex-injection / ReDoS vector (CWE-1333).
      const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const nameRegex = new RegExp(`\\b${escapedName}\\b`, "g");
      redacted = redacted.replace(nameRegex, "[Name]");
    }

    // Collapse multiple consecutive [Name] placeholders
    redacted = redacted.replace(/\[Name\](?:\s*,\s*\[Name\])+/g, "[Name]");
    redacted = redacted.replace(/\[Name\]\s+\[Name\]/g, "[Name]");

    return redacted;
  }

  /**
   * Redact all structured PII patterns (emails, phones, bank details, addresses, etc.)
   * Returns the text with those patterns replaced by placeholders.
   */
  private redactStructuredPII(text: string, userEmail?: string): string {
    let redacted = text;

    // 1. Redact email addresses
    if (userEmail) {
      // nosemgrep
      const emailRegex = new RegExp(
        userEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "gi",
      );
      redacted = redacted.replace(emailRegex, "[Your Email]");
    }
    // Redact other email addresses. Quantifiers are length-bounded (RFC 5321
    // limits: local <=64, domain <=255, TLD <=24) so adversarial input can't
    // drive super-linear backtracking (CWE-1333 ReDoS).
    redacted = redacted.replace(
      /[a-zA-Z0-9._%+-]{1,64}@[a-zA-Z0-9.-]{1,255}\.[a-zA-Z]{2,24}/g,
      "[Email]",
    );

    // 2. Redact phone numbers (various formats)
    // International format: +1 234 567 8901, +61 4 1234 5678
    redacted = redacted.replace(
      /\+\d{1,3}[\s.-]?\d{1,4}[\s.-]?\d{1,4}[\s.-]?\d{1,4}[\s.-]?\d{0,4}/g,
      "[Phone]",
    );
    // US format: (123) 456-7890, 123-456-7890, 123.456.7890
    redacted = redacted.replace(
      /\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g,
      "[Phone]",
    );

    // 3. Redact bank account numbers (6-17 digits, possibly with spaces/dashes)
    // BSB (Australia): 123-456 or 123456
    redacted = redacted.replace(/\b\d{3}[-\s]?\d{3}\b/g, "[BSB]");
    // Account numbers: typically 6-12 digits
    redacted = redacted.replace(
      /\b(?:account|acct|a\/c)[\s:#]*\d{6,12}\b/gi,
      "[Account Number]",
    );
    // Credit card numbers: 13-19 digits with spaces/dashes
    redacted = redacted.replace(
      /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{1,7}\b/g,
      "[Card Number]",
    );
    // IBAN: 2 letters + 2 digits + up to 30 alphanumeric
    redacted = redacted.replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{4,30}\b/g, "[IBAN]");
    // SWIFT/BIC codes: 8 or 11 characters
    redacted = redacted.replace(
      /\b[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/g,
      "[SWIFT Code]",
    );

    // 4. Redact SSN/Tax ID numbers
    // US SSN: 123-45-6789
    redacted = redacted.replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[SSN]");
    // Australian TFN: 123 456 789
    redacted = redacted.replace(/\b\d{3}\s\d{3}\s\d{3}\b/g, "[Tax ID]");

    // 5. Redact street addresses (basic patterns)
    // Street addresses: 123 Main Street, 456 Oak Ave
    redacted = redacted.replace(
      /\b\d{1,5}\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Court|Ct|Place|Pl|Way|Circle|Cir)\b/gi,
      "[Address]",
    );
    // PO Box
    redacted = redacted.replace(/\bP\.?O\.?\s*Box\s*\d+\b/gi, "[PO Box]");
    // Postal/ZIP codes (various formats)
    // US ZIP
    redacted = redacted.replace(/\b\d{5}(?:-\d{4})?\b/g, "[Postal Code]");
    // Australian postcode before state
    redacted = redacted.replace(
      /\b\d{4}\b(?=\s*[A-Z]{2,3}\b)/g,
      "[Postal Code]",
    );

    // 6. Redact dates of birth in common formats
    redacted = redacted.replace(
      /\b(?:DOB|Date of Birth|Born|Birthday)[\s:]*\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b/gi,
      "[Date of Birth]",
    );

    // 7. Redact passport/license numbers (generic pattern after keywords)
    redacted = redacted.replace(
      /\b(?:passport|license|licence|ID)[\s:#]*[A-Z0-9]{6,12}\b/gi,
      "[ID Number]",
    );

    return redacted;
  }

  /**
   * Scan text for names that appear in high-confidence contexts and return a set
   * of names that should be replaced with [Name].
   *
   * High-confidence patterns:
   * - After greetings: "Hi John,", "Hello Sarah,"
   * - In thank-you closings: "Thanks John", "Ok thanks Donyl"
   * - Two-part names after greetings: "Hi John Smith,"
   * - Before action verbs: "John said", "Sarah wrote"
   * - After [Name] placeholders (two-part names)
   */
  private collectNamesToRedact(text: string): Set<string> {
    const namesToRedact = new Set<string>();

    // 1. After greetings: "Hi John,", "Hello Sarah,", "Hey Mike,", "Dear Jane,"
    // capture group 1 = greeting keyword, group 2 = name candidate
    this.extractNamesWithPattern(
      text,
      /\b(Hi|Hello|Hey|Dear)\s+([A-Z][a-z]+)(\s*[,:])?/g,
      2,
      namesToRedact,
      false,
    );

    // 2. In signature contexts: "Thanks Sarah", "cheers Mike" + "Ok thanks Name"
    this.extractNamesWithPattern(
      text,
      /\b(?:thanks|thank you|thx|cheers)\s+([A-Z][a-z]+)/gi,
      1,
      namesToRedact,
    );
    this.extractNamesWithPattern(
      text,
      /\b(?:ok|okay)\s+(?:thanks|thank you)\s+([A-Z][a-z]+)/gi,
      1,
      namesToRedact,
    );

    // 3. Two-part names after greetings: "Hi John Smith,"
    this.extractNamesWithPattern(
      text,
      /\b(Hi|Hello|Hey|Dear)\s+[A-Z][a-z]+\s+([A-Z][a-z]+)[,.:]/g,
      2,
      namesToRedact,
    );

    // 4. Before verbs: "John said", "Sarah wrote", "Mike from"
    this.extractNamesWithPattern(
      text,
      /\b([A-Z][a-z]+)\s+(said|wrote|from|replied|mentioned|told|asked|explained)\b/g,
      1,
      namesToRedact,
    );

    // 5. Names after [Name] placeholder (catches two-part names)
    this.extractNamesWithPattern(
      text,
      /\[Name\]\s+([A-Z][a-z]+)/g,
      1,
      namesToRedact,
    );

    return namesToRedact;
  }

  /**
   * Run a regex over text, extract the name from the given capture group index,
   * filter out common words, and add qualifying names to the provided set.
   *
   * @param requireMinLength - when true (default), requires name.length >= 2
   */
  private extractNamesWithPattern(
    text: string,
    pattern: RegExp,
    captureGroup: number,
    namesToRedact: Set<string>,
    requireMinLength = true,
  ): void {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const name = match[captureGroup];
      if (
        name &&
        !this.isCommonWord(name) &&
        (!requireMinLength || name.length >= 2)
      ) {
        namesToRedact.add(name);
      }
    }
  }

  /**
   * Check if a word is a common word that shouldn't be redacted as a name
   */
  private isCommonWord(word: string): boolean {
    const commonWords = new Set([
      // Greetings and closings
      "Hi",
      "Hello",
      "Hey",
      "Dear",
      "Thanks",
      "Thank",
      "Best",
      "Regards",
      "Sincerely",
      "Cheers",
      "Warm",
      "All",
      "The",
      // Common nouns that might be capitalized
      "Campaign",
      "Journey",
      "Session",
      "Focus",
      "Bear",
      "Semester",
      "Efforts",
      "Internship",
      "Designer",
      "Support",
      "Campaign",
      "Journey",
      "Session",
      "Designer",
      "Support",
      // Could be a name, but also common in context - be conservative
      "Mia",
      // Articles and pronouns
      "The",
      "This",
      "That",
      "There",
      "These",
      "Those",
      "I",
      "You",
      "We",
      "They",
      "He",
      "She",
      "It",
      "A",
      "An",
      "And",
      "Or",
      "But",
      // Question words
      "What",
      "Who",
      "How",
      "Why",
      "When",
      "Where",
      // Very short words (unlikely to be names)
    ]);

    return commonWords.has(word) || word.length <= 2;
  }

  /**
   * Check if two context values are similar/overlapping (for deduplication)
   * Uses word overlap and key phrase matching to detect duplicates
   */
  areContextValuesSimilar(value1: string, value2: string): boolean {
    const normalize = (inputString: string): string =>
      inputString
        .toLowerCase()
        .trim()
        // Remove punctuation
        .replace(/[^\w\s]/g, " ")
        // Normalize whitespace
        .replace(/\s+/g, " ");

    const v1 = normalize(value1);
    const v2 = normalize(value2);

    // Exact match after normalization
    if (v1 === v2) return true;

    // Check for significant word overlap (at least 60% of words match)
    // Ignore short words
    const words1 = new Set(v1.split(" ").filter((word) => word.length > 3));
    const words2 = new Set(v2.split(" ").filter((word) => word.length > 3));

    if (words1.size === 0 || words2.size === 0) return false;

    const intersection = new Set(
      [...words1].filter((word) => words2.has(word)),
    );
    const union = new Set([...words1, ...words2]);
    const similarity = intersection.size / union.size;

    // If 60%+ word overlap, consider them similar
    if (similarity >= RATIOS.SIXTY_PERCENT) return true;

    // Check for key phrase overlap (e.g., "PostHog", "document collaboration", "SOP review")
    // Extract key phrases (2-3 word sequences) and check for overlap
    const getKeyPhrases = (text: string): Set<string> => {
      // Lower threshold to catch "SOP"
      const words = text.split(" ").filter((word) => word.length > 2);
      const phrases = new Set<string>();
      // Add 2-word phrases
      for (let i = 0; i < words.length - 1; i++) {
        phrases.add(`${words[i]} ${words[i + 1]}`);
      }
      // Add 3-word phrases for important terms
      for (let i = 0; i < words.length - 2; i++) {
        phrases.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
      }
      return phrases;
    };

    const phrases1 = getKeyPhrases(v1);
    const phrases2 = getKeyPhrases(v2);

    // If they share key phrases (especially product names, project names), consider similar
    let sharedPhrases = 0;
    for (const phrase of phrases1) {
      if (phrases2.has(phrase)) {
        sharedPhrases++;
      }
    }

    // Also check for single important words (product names, project names) that appear in both
    const importantWords = [
      "posthog",
      "document",
      "collaboration",
      "sop",
      "review",
      "analytics",
      "integration",
    ];
    const v1Words = v1.split(" ");
    const v2Words = v2.split(" ");
    let sharedImportantWords = 0;
    for (const word of importantWords) {
      if (v1Words.includes(word) && v2Words.includes(word)) {
        sharedImportantWords++;
      }
    }

    // If they share 2+ key phrases OR 2+ important words, they're similar
    if (sharedPhrases >= 2 || sharedImportantWords >= 2) return true;

    return false;
  }
}
