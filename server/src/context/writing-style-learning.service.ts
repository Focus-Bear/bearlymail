import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { RATIOS } from "../constants/percentages";
import { Email } from "../database/entities/email.entity";
import { LLMService } from "../llm/llm.service";
import { formatGaxiosError } from "../types/common";
import { UsersService } from "../users/users.service";

// Target number of email examples to collect
const TARGET_EXAMPLE_COUNT = 20;
// Max new examples to add per sync
const MAX_EXAMPLES_PER_SYNC = 3;
// Max LLM validation calls per collection run. Sent-email batches are mostly
// auto-generated/quoted content that gets rejected, so without a cap a single
// run could spend one LLM call per email (~150) chasing the last few examples.
const MAX_VALIDATION_ATTEMPTS_PER_RUN = 8;
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
/**
 * Stored examples are prefixed with "Example: "; strip it before word-overlap
 * comparison so the prefix doesn't count as email content.
 */
function stripExamplePrefix(rule: string): string {
  return rule.replace(/^example:\s*/, "");
}

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
      // Strip HTML tags. [^<>] (not [^>]) keeps this linear and prevents a
      // nested-tag single-pass bypass (CWE-1333/CWE-116). The result is only
      // used as plain text (LLM validation + word-overlap dedup), never rendered
      // as HTML.
      .replace(/<[^<>]+>/g, "")
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
    // Belt-and-suspenders: never spend LLM calls once the user already has a
    // full set of examples (callers guard too, but this makes it impossible to
    // slip through).
    if (existingExamples.length >= TARGET_EXAMPLE_COUNT || needCount <= 0) {
      return [];
    }

    const newExamples: string[] = [];
    let validationAttempts = 0;
    for (const rawBody of bodies) {
      if (newExamples.length >= needCount) break;
      // Bound the LLM calls per run: stop chasing the last few examples through
      // a batch of mostly-rejected sent emails — the rest are picked up next sync.
      if (validationAttempts >= MAX_VALIDATION_ATTEMPTS_PER_RUN) {
        this.logger.debug(
          `Reached per-run validation cap (${MAX_VALIDATION_ATTEMPTS_PER_RUN}) for user ${userId}; deferring the rest to the next sync`,
        );
        break;
      }

      const snippet = this.extractEmailSnippet(rawBody ?? "");
      if (!snippet) continue;

      if (this.isObviouslyNotUserWritten(snippet)) {
        this.logger.debug(
          `Skipping non-user-written email for user ${userId} (pre-filter)`,
        );
        continue;
      }

      if (this.isSnippetAlreadyCovered(snippet, existingExamples, userId)) {
        continue;
      }

      validationAttempts++;
      let validated: string | null;
      try {
        validated = await this.llmService.validateWritingExample(snippet);
      } catch (error) {
        // A transient LLM failure (rate limit/timeout) on one snippet must not abort the whole
        // run and discard examples already validated earlier this pass — skip just this snippet.
        this.logger.error(
          `Error validating writing example for user ${userId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        continue;
      }
      if (!validated) {
        this.logger.debug(`LLM rejected email example for user ${userId}`);
        continue;
      }

      const isDuplicate = existingExamples.some((existing: string) =>
        this.areSimilar(
          stripExamplePrefix(existing.toLowerCase()),
          validated.toLowerCase(),
        ),
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
        sentEmails.map((emailEntry) => emailEntry.body ?? ""),
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
        `Error learning from sent emails for user ${userId}: ${formatGaxiosError(error)}`,
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
    // Anchored, single-char whitespace and a bounded [^\n]{} middle keep this
    // linear — a leading `\s*` (which matches newlines) next to `(?:^|\n)` is the
    // classic quadratic-backtracking source on long newline runs (CWE-1333).
    const onWrotePattern = /(?:^|\n)[ \t]*On\s[^\n]{10,1000}\swrote:[ \t]*$/im;
    const onWroteMatch = cleaned.match(onWrotePattern);
    if (onWroteMatch && onWroteMatch.index !== undefined) {
      cleaned = cleaned.substring(0, onWroteMatch.index);
    }

    // Also handle inline "On ... wrote:" mid-sentence (e.g. text ending with "On Wed, 4 Feb 2026 at 17:50, Name wrote:")
    const inlineOnWrotePattern =
      /\.\s{1,10}On\s(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun|\d)[^\n]{10,1000}\swrote:[ \t]*$/im;
    const inlineMatch = cleaned.match(inlineOnWrotePattern);
    if (inlineMatch && inlineMatch.index !== undefined) {
      cleaned = cleaned.substring(0, inlineMatch.index + 1);
    }

    // Remove "-----Original Message-----" and everything after
    const originalMessagePattern =
      /(?:^|\n)[ \t]*-{3,}\s*Original Message\s*-{3,}/i;
    const originalMatch = cleaned.match(originalMessagePattern);
    if (originalMatch && originalMatch.index !== undefined) {
      cleaned = cleaned.substring(0, originalMatch.index);
    }

    // Remove "From: [email]" header blocks (forwarded emails)
    const fromHeaderPattern =
      /(?:^|\n)[ \t]*From:[ \t]*[^\n]{1,1000}\n[ \t]*(?:Sent|Date|To|Subject):/i;
    const fromMatch = cleaned.match(fromHeaderPattern);
    if (fromMatch && fromMatch.index !== undefined) {
      cleaned = cleaned.substring(0, fromMatch.index);
    }

    // Remove Gmail-style "---------- Forwarded message ---------"
    const forwardedPattern = /(?:^|\n)[ \t]*-{5,}\s*Forwarded message\s*-{5,}/i;
    const forwardedMatch = cleaned.match(forwardedPattern);
    if (forwardedMatch && forwardedMatch.index !== undefined) {
      cleaned = cleaned.substring(0, forwardedMatch.index);
    }

    // Remove Outlook-style "________________________________" separator and everything after
    const outlookSeparatorPattern = /(?:^|\n)[ \t]*_{10,}/;
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
    const words1 = new Set(
      text1.split(/\s+/).filter((word) => word.length > 3),
    );
    const words2 = new Set(
      text2.split(/\s+/).filter((word) => word.length > 3),
    );

    if (words1.size === 0 || words2.size === 0) {
      return false;
    }

    const intersection = [...words1].filter((word) => words2.has(word));
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
        `Error learning from sent email bodies for user ${userId}: ${formatGaxiosError(error)}`,
      );
    }
  }

  /**
   * Dedup BEFORE spending an LLM call: users below the target example count
   * keep the same recent sent emails in the fetch window across runs, so
   * without this check the same snippets get re-validated every cycle only to
   * be discarded as duplicates after the call.
   */
  private isSnippetAlreadyCovered(
    snippet: string,
    existingExamples: string[],
    userId: string,
  ): boolean {
    const covered = existingExamples.some((existing: string) =>
      this.areSimilar(
        stripExamplePrefix(existing.toLowerCase()),
        snippet.toLowerCase(),
      ),
    );
    if (covered) {
      this.logger.debug(
        `Skipping already-covered email example for user ${userId} (pre-LLM dedup)`,
      );
    }
    return covered;
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
