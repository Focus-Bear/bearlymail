import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Migration: ClearPreLlmPhishingFalsePositives
 *
 * Clears phishing flags that were set by the old keyword-only system before
 * PR #768 merged LLM-based phishing verdicts (2026-03-09).
 *
 * The keyword-only system produced many false positives. These emails were
 * never re-evaluated by the LLM because:
 *   1. saveSummaryResults() only wrote phishing columns on positive detection
 *      (never cleared them) — fixed in this PR.
 *   2. Already-summarized emails were skipped entirely — also fixed in this PR.
 *
 * Nulling out phishingConfidence/phishingReason causes re-evaluation on next
 * access via the new LLM pipeline.
 *
 * Targets: emails updated before the PR #768 merge timestamp that still carry
 * phishing data (i.e. keyword-only verdicts, never re-evaluated by LLM).
 */
export class ClearPreLlmPhishingFalsePositives1786100000000 implements MigrationInterface {
  name = "ClearPreLlmPhishingFalsePositives1786100000000";

  // PR #768 merge timestamp — emails updated before this were flagged by
  // the keyword-only system and should be re-evaluated.
  private readonly PR_768_MERGE_DATE = "2026-03-09T03:20:00.000Z";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "emails"
       SET "phishingConfidence" = NULL, "phishingReason" = NULL
       WHERE "phishingConfidence" IS NOT NULL
         AND "receivedAt" < $1`,
      [this.PR_768_MERGE_DATE],
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Cannot restore cleared phishing data — this migration is intentionally irreversible.
    // The LLM will re-evaluate emails on next access.
  }
}
