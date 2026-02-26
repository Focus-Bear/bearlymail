import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Email } from "../database/entities/email.entity";
import { UsersService } from "../users/users.service";
import { LLMService } from "../llm/llm.service";
import { RATIOS } from "../constants/percentages";

// Target number of email examples to collect
const TARGET_EXAMPLE_COUNT = 20;
// Max new examples to add per sync
const MAX_EXAMPLES_PER_SYNC = 3;
// Min email length to consider for examples
const MIN_EMAIL_LENGTH = 50;
// Max email length for examples
const MAX_EMAIL_LENGTH = 500;
const AUTO_RESPONDER_PATTERNS = [
  /\bbearlymail\b/i,
  /\bai\s+email\s+assist/i,
  /\bautomated\s+response\b/i,
  /\bauto[- ]?reply\b/i,
  /\bthis\s+is\s+an?\s+automated\b/i,
  /\bdo\s+not\s+reply\b/i,
  /\bnoreply@/i,
  /\bno-reply@/i,
  /\bout[- ]of[- ]office\b/i,
];

const CALENDAR_EVENT_PATTERNS = [
  /\bthis\s+event\s+has\s+been\s+(updated|cancelled|canceled)\b/i,
  /\binvitation:\s/i,
  /\bevent\s+notification\b/i,
  /\bcalendar\s+notification\b/i,
  /\bwhen:\s.*\d{1,2}:\d{2}\b/i,
  /\bwhere:\s/i,
  /\brsvp\b/i,
  /\baccept\s*\|\s*decline\b/i,
  /\bmeet\s+video\s+conference\b/i,
  /^[^\n]{0,200}@\s+\w+.*\d{1,2}\s+\w+\s+\d{4}\s+·\s+\d{1,2}:\d{2}/i,
];

/**
 * Check if a rule is an email example.
 * Email examples are rules that don't start with known prefixes like "Tone:", "Style:", or "Common phrase:".
 * This includes both rules with "Example:" prefix and legacy rules without any prefix.
 */
function isEmailExample(rule: string): boolean {
  return (
    !rule.startsWith("Tone:") &&
    !rule.startsWith("Style:") &&
    !rule.startsWith("Common phrase:")
  );
}

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
  private extractEmailSnippet(rawBody: string): string | null {
    const body = this.stripQuotedContent(rawBody.trim());
    if (!body || body.length < MIN_EMAIL_LENGTH) return null;

    let snippet = body
      .substring(0, MAX_EMAIL_LENGTH)
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (snippet.length < MIN_EMAIL_LENGTH) return null;

    if (snippet.length === MAX_EMAIL_LENGTH) {
      const cutPoint = Math.max(
        snippet.lastIndexOf("."),
        snippet.lastIndexOf("\n"),
        snippet.lastIndexOf(" "),
      );
      if (cutPoint > MIN_EMAIL_LENGTH) {
        snippet = snippet.substring(0, cutPoint + 1).trim();
      }
      snippet = `${snippet}...`;
    }
    return snippet;
  }

  private async processEmailBodiesForExamples(
    bodies: string[],
    userId: string,
    existingExamples: string[],
    needCount: number,
  ): Promise<string[]> {
    const newExamples: string[] = [];
    for (const rawBody of bodies) {
      if (newExamples.length >= needCount) break;

      const snippet = this.extractEmailSnippet(rawBody ?? "");
      if (!snippet) continue;

      if (this.isObviouslyNotUserWritten(snippet)) {
        this.logger.debug(
          `Skipping non-user-written email for user ${userId} (pre-filter)`,
        );
        continue;
      }

      const validated = await this.llmService.validateWritingExample(snippet);
      if (!validated) {
        this.logger.debug(`LLM rejected email example for user ${userId}`);
        continue;
      }

      const isDuplicate = existingExamples.some((existing: string) =>
        this.areSimilar(existing.toLowerCase(), validated.toLowerCase()),
      );

      if (!isDuplicate) {
        newExamples.push(`Example: ${validated}`);
      }
    }
    return newExamples;
  }

  async learnFromNewSentEmails(
    userId: string,
    newSentEmailIds: string[],
  ): Promise<void> {
    if (newSentEmailIds.length === 0) return;

    try {
      const user = await this.usersService.findOne(userId);
      if (!user) return;

      const existingRules = user.toneSettings?.rules || [];
      const existingExamples = existingRules.filter((rule: string) =>
        isEmailExample(rule),
      );

      if (existingExamples.length >= TARGET_EXAMPLE_COUNT) {
        this.logger.debug(
          `User ${userId} already has ${existingExamples.length} examples, skipping learning`,
        );
        return;
      }

      const needCount = Math.min(
        TARGET_EXAMPLE_COUNT - existingExamples.length,
        MAX_EXAMPLES_PER_SYNC,
      );

      this.logger.log(
        `User ${userId} has ${existingExamples.length}/${TARGET_EXAMPLE_COUNT} examples, learning from ${newSentEmailIds.length} new sent emails (max ${needCount})`,
      );

      const sentEmails = await this.emailRepository.find({
        where: newSentEmailIds.map((id) => ({ id, userId })),
        order: { receivedAt: "DESC" },
        take: needCount * 2,
      });

      if (sentEmails.length === 0) return;

      const newExamples = await this.processEmailBodiesForExamples(
        sentEmails.map((e) => e.body ?? ""),
        userId,
        existingExamples,
        needCount,
      );

      if (newExamples.length === 0) {
        this.logger.debug(`No new suitable examples found for user ${userId}`);
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
    // Matches both with and without leading newline:
    // "On Mon, Jan 1, 2024 at 10:00 AM John Doe <john@example.com> wrote:"
    const onWrotePattern = /(?:^|\n)\s*On\s+.{10,150}\s+wrote:\s*$/im;
    const onWroteMatch = cleaned.match(onWrotePattern);
    if (onWroteMatch && onWroteMatch.index !== undefined) {
      cleaned = cleaned.substring(0, onWroteMatch.index);
    }

    // Also handle inline "On ... wrote:" mid-sentence (e.g. text ending with "On Wed, 4 Feb 2026 at 17:50, Name wrote:")
    const inlineOnWrotePattern =
      /\.\s+On\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|\d).{10,150}\s+wrote:\s*$/im;
    const inlineMatch = cleaned.match(inlineOnWrotePattern);
    if (inlineMatch && inlineMatch.index !== undefined) {
      cleaned = cleaned.substring(0, inlineMatch.index + 1);
    }

    // Remove "-----Original Message-----" and everything after
    const originalMessagePattern =
      /(?:^|\n)\s*-{3,}\s*Original Message\s*-{3,}/i;
    const originalMatch = cleaned.match(originalMessagePattern);
    if (originalMatch && originalMatch.index !== undefined) {
      cleaned = cleaned.substring(0, originalMatch.index);
    }

    // Remove "From: [email]" header blocks (forwarded emails)
    const fromHeaderPattern =
      /(?:^|\n)\s*From:\s*[^\n]+\n\s*(?:Sent|Date|To|Subject):/i;
    const fromMatch = cleaned.match(fromHeaderPattern);
    if (fromMatch && fromMatch.index !== undefined) {
      cleaned = cleaned.substring(0, fromMatch.index);
    }

    // Remove Gmail-style "---------- Forwarded message ---------"
    const forwardedPattern = /(?:^|\n)\s*-{5,}\s*Forwarded message\s*-{5,}/i;
    const forwardedMatch = cleaned.match(forwardedPattern);
    if (forwardedMatch && forwardedMatch.index !== undefined) {
      cleaned = cleaned.substring(0, forwardedMatch.index);
    }

    // Remove Outlook-style "________________________________" separator and everything after
    const outlookSeparatorPattern = /(?:^|\n)\s*_{10,}/;
    const outlookMatch = cleaned.match(outlookSeparatorPattern);
    if (outlookMatch && outlookMatch.index !== undefined) {
      cleaned = cleaned.substring(0, outlookMatch.index);
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
    return intersection.length / union.size > RATIOS.SIXTY_PERCENT;
  }

  /**
   * Learn from sent email bodies directly (used when fetching from provider)
   */
  async learnFromSentEmailBodies(
    userId: string,
    emailBodies: string[],
  ): Promise<void> {
    if (emailBodies.length === 0) return;

    try {
      const user = await this.usersService.findOne(userId);
      if (!user) return;

      const existingRules = user.toneSettings?.rules || [];
      const existingExamples = existingRules.filter((rule: string) =>
        isEmailExample(rule),
      );

      if (existingExamples.length >= TARGET_EXAMPLE_COUNT) return;

      const needCount = Math.min(
        TARGET_EXAMPLE_COUNT - existingExamples.length,
        MAX_EXAMPLES_PER_SYNC,
      );

      const newExamples = await this.processEmailBodiesForExamples(
        emailBodies,
        userId,
        existingExamples,
        needCount,
      );

      if (newExamples.length === 0) return;

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

  private isObviouslyNotUserWritten(text: string): boolean {
    for (const pattern of AUTO_RESPONDER_PATTERNS) {
      if (pattern.test(text)) {
        return true;
      }
    }
    for (const pattern of CALENDAR_EVENT_PATTERNS) {
      if (pattern.test(text)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get the count of email examples for a user
   */
  async getExampleCount(userId: string): Promise<number> {
    const user = await this.usersService.findOne(userId);
    if (!user?.toneSettings?.rules) {
      return 0;
    }

    // Count email examples (rules that are not Tone/Style/Common phrase)
    // This includes both "Example:" prefixed rules and legacy rules without prefix
    return user.toneSettings.rules.filter((rule: string) =>
      isEmailExample(rule),
    ).length;
  }
}
