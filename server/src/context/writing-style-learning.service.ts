import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, MoreThan } from "typeorm";
import { Email } from "../database/entities/email.entity";
import { UsersService } from "../users/users.service";
import { LLMService } from "../llm/llm.service";
import { QUERY_LIMITS } from "../constants/query-limits";

// Target number of email examples to collect
const TARGET_EXAMPLE_COUNT = 20;
// Max new examples to add per sync
const MAX_EXAMPLES_PER_SYNC = 3;
// Min email length to consider for examples
const MIN_EMAIL_LENGTH = 50;
// Max email length for examples
const MAX_EMAIL_LENGTH = 500;

@Injectable()
export class WritingStyleLearningService {
  private readonly logger = new Logger(WritingStyleLearningService.name);

  constructor(
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    private usersService: UsersService,
    private llmService: LLMService,
  ) {}

  /**
   * Check if we should learn from new sent emails and do so if needed.
   * Called after email sync detects new sent emails.
   */
  async learnFromNewSentEmails(
    userId: string,
    newSentEmailIds: string[],
  ): Promise<void> {
    if (newSentEmailIds.length === 0) {
      return;
    }

    try {
      // Get current user and their toneSettings
      const user = await this.usersService.findOne(userId);
      if (!user) {
        return;
      }

      const existingRules = user.toneSettings?.rules || [];

      // Count existing email examples (not Tone:, Style:, or Common phrase:)
      const existingExamples = existingRules.filter(
        (rule: string) =>
          !rule.startsWith("Tone:") &&
          !rule.startsWith("Style:") &&
          !rule.startsWith("Common phrase:"),
      );

      // If we already have enough examples, skip
      if (existingExamples.length >= TARGET_EXAMPLE_COUNT) {
        this.logger.debug(
          `User ${userId} already has ${existingExamples.length} examples, skipping learning`,
        );
        return;
      }

      // Calculate how many more we need
      const needCount = Math.min(
        TARGET_EXAMPLE_COUNT - existingExamples.length,
        MAX_EXAMPLES_PER_SYNC,
      );

      this.logger.log(
        `User ${userId} has ${existingExamples.length}/${TARGET_EXAMPLE_COUNT} examples, learning from ${newSentEmailIds.length} new sent emails (max ${needCount})`,
      );

      // Fetch the new sent emails
      const sentEmails = await this.emailRepository.find({
        where: newSentEmailIds.map((id) => ({ id, userId })),
        order: { receivedAt: "DESC" },
        take: needCount * 2, // Fetch more than needed in case some are filtered
      });

      if (sentEmails.length === 0) {
        return;
      }

      // Filter and extract good examples
      const newExamples: string[] = [];
      for (const email of sentEmails) {
        if (newExamples.length >= needCount) {
          break;
        }

        const rawBody = email.body?.trim();
        if (!rawBody || rawBody.length < MIN_EMAIL_LENGTH) {
          continue;
        }

        // Strip quoted content to get only the user's own writing
        const body = this.stripQuotedContent(rawBody);
        if (!body || body.length < MIN_EMAIL_LENGTH) {
          continue;
        }

        // Extract a representative snippet (first part of email)
        let snippet = body.substring(0, MAX_EMAIL_LENGTH);

        // Clean up the snippet - remove excessive whitespace, HTML artifacts
        snippet = snippet
          .replace(/<[^>]+>/g, "") // Remove HTML tags
          .replace(/\s+/g, " ") // Normalize whitespace
          .trim();

        if (snippet.length < MIN_EMAIL_LENGTH) {
          continue;
        }

        // If snippet was truncated mid-word, try to end at a sentence or word boundary
        if (snippet.length === MAX_EMAIL_LENGTH) {
          const lastPeriod = snippet.lastIndexOf(".");
          const lastNewline = snippet.lastIndexOf("\n");
          const lastSpace = snippet.lastIndexOf(" ");
          const cutPoint = Math.max(lastPeriod, lastNewline, lastSpace);
          if (cutPoint > MIN_EMAIL_LENGTH) {
            snippet = snippet.substring(0, cutPoint + 1).trim();
          }
          snippet = `${snippet}...`;
        }

        // Use LLM to redact names
        const redacted = await this.llmService.redactNamesWithLLM(snippet);

        // Check for duplicates (similar content)
        const isDuplicate = existingExamples.some((existing: string) =>
          this.areSimilar(existing.toLowerCase(), redacted.toLowerCase()),
        );

        if (!isDuplicate) {
          newExamples.push(redacted);
        }
      }

      if (newExamples.length === 0) {
        this.logger.debug(`No new suitable examples found for user ${userId}`);
        return;
      }

      // Add new examples to toneSettings.rules
      const updatedRules = [...existingRules, ...newExamples].slice(
        0,
        // Keep some buffer for Tone/Style/CommonPhrase entries
        TARGET_EXAMPLE_COUNT + 10,
      );

      await this.usersService.update(userId, {
        toneSettings: { rules: updatedRules },
      });

      this.logger.log(
        `Added ${newExamples.length} new writing style examples for user ${userId} (total: ${updatedRules.length})`,
      );
    } catch (error) {
      this.logger.error(
        `Error learning from sent emails for user ${userId}:`,
        error,
      );
    }
  }

  /**
   * Strip quoted content from email body to get only the user's own writing.
   * Removes:
   * - Lines starting with ">" (quoted text)
   * - "On [date], [name] wrote:" patterns and everything after
   * - "From: [email]" headers in forwarded/replied emails
   * - "-----Original Message-----" markers and everything after
   * - Gmail-style quoted blocks
   */
  private stripQuotedContent(body: string): string {
    let cleaned = body;

    // Remove "On [date], [name] wrote:" patterns and everything after
    // Matches: "On Mon, Jan 1, 2024 at 10:00 AM John Doe <john@example.com> wrote:"
    const onWrotePattern = /\n\s*On\s+.{10,100}\s+wrote:\s*\n/i;
    const onWroteMatch = cleaned.match(onWrotePattern);
    if (onWroteMatch && onWroteMatch.index !== undefined) {
      cleaned = cleaned.substring(0, onWroteMatch.index);
    }

    // Remove "-----Original Message-----" and everything after
    const originalMessagePattern = /\n\s*-{3,}\s*Original Message\s*-{3,}/i;
    const originalMatch = cleaned.match(originalMessagePattern);
    if (originalMatch && originalMatch.index !== undefined) {
      cleaned = cleaned.substring(0, originalMatch.index);
    }

    // Remove "From: [email]" header blocks (forwarded emails)
    const fromHeaderPattern =
      /\n\s*From:\s*[^\n]+\n\s*(?:Sent|Date|To|Subject):/i;
    const fromMatch = cleaned.match(fromHeaderPattern);
    if (fromMatch && fromMatch.index !== undefined) {
      cleaned = cleaned.substring(0, fromMatch.index);
    }

    // Remove Gmail-style "---------- Forwarded message ---------"
    const forwardedPattern = /\n\s*-{5,}\s*Forwarded message\s*-{5,}/i;
    const forwardedMatch = cleaned.match(forwardedPattern);
    if (forwardedMatch && forwardedMatch.index !== undefined) {
      cleaned = cleaned.substring(0, forwardedMatch.index);
    }

    // Remove lines starting with ">" (quoted text)
    cleaned = cleaned
      .split("\n")
      .filter((line) => !line.trim().startsWith(">"))
      .join("\n");

    // Remove excessive whitespace left behind
    cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();

    return cleaned;
  }

  /**
   * Check if two text snippets are similar (for deduplication)
   */
  private areSimilar(text1: string, text2: string): boolean {
    // Simple word overlap check
    const words1 = new Set(text1.split(/\s+/).filter((w) => w.length > 3));
    const words2 = new Set(text2.split(/\s+/).filter((w) => w.length > 3));

    if (words1.size === 0 || words2.size === 0) {
      return false;
    }

    const intersection = [...words1].filter((w) => words2.has(w));
    const union = new Set([...words1, ...words2]);

    // If 60%+ word overlap, consider them similar
    return intersection.length / union.size > 0.6;
  }

  /**
   * Learn from sent email bodies directly (used when fetching from provider)
   */
  async learnFromSentEmailBodies(
    userId: string,
    emailBodies: string[],
  ): Promise<void> {
    if (emailBodies.length === 0) {
      return;
    }

    try {
      const user = await this.usersService.findOne(userId);
      if (!user) {
        return;
      }

      const existingRules = user.toneSettings?.rules || [];
      const existingExamples = existingRules.filter(
        (rule: string) =>
          !rule.startsWith("Tone:") &&
          !rule.startsWith("Style:") &&
          !rule.startsWith("Common phrase:"),
      );

      if (existingExamples.length >= TARGET_EXAMPLE_COUNT) {
        return;
      }

      const needCount = Math.min(
        TARGET_EXAMPLE_COUNT - existingExamples.length,
        MAX_EXAMPLES_PER_SYNC,
      );

      const newExamples: string[] = [];
      for (const body of emailBodies) {
        if (newExamples.length >= needCount) {
          break;
        }

        const rawBody = body?.trim();
        if (!rawBody || rawBody.length < MIN_EMAIL_LENGTH) {
          continue;
        }

        // Strip quoted content to get only the user's own writing
        const trimmed = this.stripQuotedContent(rawBody);
        if (!trimmed || trimmed.length < MIN_EMAIL_LENGTH) {
          continue;
        }

        let snippet = trimmed.substring(0, MAX_EMAIL_LENGTH);
        snippet = snippet
          .replace(/<[^>]+>/g, "")
          .replace(/\s+/g, " ")
          .trim();

        if (snippet.length < MIN_EMAIL_LENGTH) {
          continue;
        }

        if (snippet.length === MAX_EMAIL_LENGTH) {
          const lastPeriod = snippet.lastIndexOf(".");
          const lastNewline = snippet.lastIndexOf("\n");
          const lastSpace = snippet.lastIndexOf(" ");
          const cutPoint = Math.max(lastPeriod, lastNewline, lastSpace);
          if (cutPoint > MIN_EMAIL_LENGTH) {
            snippet = snippet.substring(0, cutPoint + 1).trim();
          }
          snippet = `${snippet}...`;
        }

        const redacted = await this.llmService.redactNamesWithLLM(snippet);

        const isDuplicate = existingExamples.some((existing: string) =>
          this.areSimilar(existing.toLowerCase(), redacted.toLowerCase()),
        );

        if (!isDuplicate) {
          newExamples.push(redacted);
        }
      }

      if (newExamples.length === 0) {
        return;
      }

      const updatedRules = [...existingRules, ...newExamples].slice(
        0,
        TARGET_EXAMPLE_COUNT + 10,
      );

      await this.usersService.update(userId, {
        toneSettings: { rules: updatedRules },
      });

      this.logger.log(
        `Added ${newExamples.length} new writing style examples for user ${userId} (total: ${updatedRules.length})`,
      );
    } catch (error) {
      this.logger.error(
        `Error learning from sent email bodies for user ${userId}:`,
        error,
      );
    }
  }

  /**
   * Get the count of email examples for a user
   */
  async getExampleCount(userId: string): Promise<number> {
    const user = await this.usersService.findOne(userId);
    if (!user?.toneSettings?.rules) {
      return 0;
    }

    return user.toneSettings.rules.filter(
      (rule: string) =>
        !rule.startsWith("Tone:") &&
        !rule.startsWith("Style:") &&
        !rule.startsWith("Common phrase:"),
    ).length;
  }
}
