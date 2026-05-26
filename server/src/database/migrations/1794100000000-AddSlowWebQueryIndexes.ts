import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Add indexes that serve the slow web-process queries identified in #2220.
 *
 * CloudWatch flagged three query families (avg 2.4s, max 9.4s) that lacked a
 * supporting index:
 *
 *  1. Stuck-priority scan (`fixStuckCalculatingThreads`, web-facing) —
 *     `SELECT ... FROM email_threads WHERE "userId" = $1 AND "isProcessingPriority" = $2`.
 *     Served by a composite index on ("userId", "isProcessingPriority").
 *
 *  2. Stats reply-time aggregations (`QueueStatsService`) —
 *     `SELECT AVG("timeToReply") ... WHERE "userId" = $1 AND "timeToReply" > 0 AND "receivedAt" > $2`
 *     (plus the thread-join and category-grouped variants). All three share the
 *     `userId` equality, `timeToReply > 0` filter and `receivedAt` range. A
 *     PARTIAL index on ("userId", "receivedAt") WHERE "timeToReply" > 0 keeps the
 *     index tiny (most emails have NULL/0 timeToReply) while serving the range.
 *
 * The sender-HMAC count query from #2220
 * (`COUNT(DISTINCT "threadId") WHERE "userId" = $1 AND "senderEmailHmac" = $2`)
 * is already served by the existing IDX_emails_userId_senderEmailHmac index, so
 * no new index is added for it here.
 *
 * Plain CREATE INDEX is used (not CONCURRENTLY) to match the existing migration
 * convention — migrations run with migrationsTransactionMode "each", so each
 * runs in its own transaction and CONCURRENTLY (which cannot run in a
 * transaction) is avoided.
 */
export class AddSlowWebQueryIndexes1794100000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Stuck-priority scan: userId + isProcessingPriority equality.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_email_threads_userId_isProcessingPriority"
       ON "email_threads" ("userId", "isProcessingPriority")`,
    );

    // 2. Stats reply-time aggregations: partial index keeps only rows that
    //    actually have a reply time (timeToReply > 0 implies NOT NULL).
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_emails_userId_receivedAt_hasReplyTime"
       ON "emails" ("userId", "receivedAt")
       WHERE "timeToReply" > 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_emails_userId_receivedAt_hasReplyTime"`,
    );

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_email_threads_userId_isProcessingPriority"`,
    );
  }
}
