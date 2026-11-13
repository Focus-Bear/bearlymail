import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Marks existing accounts verified where the data already shows the person
 * proved they own the address:
 *
 *  1. They have signed in with Google (`googleId` is only set by a Google
 *     sign-in matched on this address).
 *  2. They have no password and no outstanding setup link — the account was
 *     created by a Google/Microsoft/Zoho sign-in (or the local Apple Mail
 *     bridge), so password sign-in isn't possible anyway.
 *  3. They completed a waitlist setup link: an approved waitlist entry for the
 *     same address, a password, and no setup link still outstanding.
 *
 * Everyone else stays unverified. A connected mailbox (Google, Office 365,
 * Zoho, IMAP or Apple Mail) whose address equals the account's also counts,
 * but those addresses are encrypted per user, so the server checks that at
 * the user's next password sign-in rather than here. Remaining users are
 * asked to confirm their address (a link is emailed) at that sign-in.
 */
export class BackfillEmailVerifiedAt1797900000001 implements MigrationInterface {
  name = "BackfillEmailVerifiedAt1797900000001";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "users" u
      SET "emailVerifiedAt" = now()
      WHERE u."emailVerifiedAt" IS NULL
        AND (
          u."googleId" IS NOT NULL
          OR (
            (u."password" IS NULL OR u."password" = '')
            AND u."passwordSetupTokenHash" IS NULL
          )
          OR (
            u."password" IS NOT NULL AND u."password" <> ''
            AND u."passwordSetupTokenHash" IS NULL
            AND EXISTS (
              SELECT 1 FROM "waitlist" w
              WHERE w."emailHash" = u."emailHash" AND w."approved" = true
            )
          )
        )
    `);
  }

  public async down(): Promise<void> {
    // Not reverted: we can't tell backfilled timestamps from real ones, and
    // the schema migration's down() drops the column anyway.
  }
}
