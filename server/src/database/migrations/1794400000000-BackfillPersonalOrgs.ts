import { MigrationInterface, QueryRunner } from "typeorm";

import { Organization } from "../entities/organization.entity";
import { OrganizationMember } from "../entities/organization-member.entity";
import { User } from "../entities/user.entity";
import { EncryptionHelper } from "../../encryption/encryption.helper";
import { encryptionKeyProvider } from "../../encryption/encryption-key-provider";

/**
 * Org-of-one backfill.
 *
 * Provisions a personal organisation (single seat, user as owner) for every
 * existing user who neither owns an org nor is an active member of one. This
 * makes the "individual = org with maxSeats=1" model hold for the existing
 * user base, so volume-based RevenueCat billing routes correctly for solo users
 * (the webhook handler resolves a buyer's org via owner lookup).
 *
 * Also promotes the organizations.ownerId index to UNIQUE so a user can only
 * ever own one org — this enforces the invariant at the DB level and makes the
 * runtime ensurePersonalOrg() idempotent under concurrent logins.
 *
 * Uses the entity manager (not raw SQL) so the encryption transformers on
 * Organization.name and OrganizationMember.email are applied correctly.
 */
export class BackfillPersonalOrgs1794400000000 implements MigrationInterface {
  name = "BackfillPersonalOrgs1794400000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // This migration intentionally uses the entity manager so the encryption
    // transformers on User (read) and Organization.name / OrganizationMember.email
    // (write) fire. But the migration runner (data-source.ts) does NOT boot the
    // encryption key the way main.ts/worker.ts do, so those transformers throw
    // "getKey() called before initialize()". Initialise it here exactly as the
    // app does at boot (KMS-aware, falls back to the static env key). Idempotent.
    if (!encryptionKeyProvider.isInitialized()) {
      await encryptionKeyProvider.initializeFromManagedKey();
    }

    const orgRepo = queryRunner.manager.getRepository(Organization);
    const memberRepo = queryRunner.manager.getRepository(OrganizationMember);
    const userRepo = queryRunner.manager.getRepository(User);

    // Fetch only users who need provisioning: no owned org AND no active membership.
    // Avoids loading the full user table and N+1 lookups on large databases.
    // Select ONLY the columns this migration reads: entity-manager queries in a
    // migration otherwise SELECT every column on the CURRENT User entity, which
    // breaks fresh-database runs as soon as a later migration adds a column
    // (the entity declares it before this migration's turn creates it).
    const users = await userRepo
      .createQueryBuilder("user")
      .select(["user.id", "user.email", "user.displayName", "user.name"])
      .leftJoin(Organization, "org", '"org"."ownerId" = "user"."id"')
      .leftJoin(
        OrganizationMember,
        "member",
        '"member"."userId" = "user"."id" AND "member"."status" = :status',
        { status: "active" },
      )
      .where('"org"."id" IS NULL')
      .andWhere('"member"."id" IS NULL')
      .getMany();
    let provisioned = 0;

    for (const user of users) {
      const orgName = user.displayName ?? user.name ?? "Personal workspace";
      const org = orgRepo.create({
        name: orgName,
        ownerId: user.id,
        maxSeats: 1,
      });
      const saved = await orgRepo.save(org);

      const ownerMember = memberRepo.create({
        organizationId: saved.id,
        userId: user.id,
        email: user.email,
        emailHash: EncryptionHelper.hashEmail(user.email),
        role: "owner",
        status: "active",
        displayName: user.displayName ?? user.name ?? null,
        inviteToken: null,
        inviteExpires: null,
        invitedBy: user.id,
      });
      await memberRepo.save(ownerMember);
      provisioned++;
    }

    // Drop any pre-existing non-unique index on ownerId, then enforce uniqueness.
    await queryRunner.query(`
      DO $$
      DECLARE idx text;
      BEGIN
        FOR idx IN
          SELECT indexname FROM pg_indexes
          WHERE tablename = 'organizations'
            AND indexdef LIKE '%ownerId%'
            AND indexdef NOT LIKE '%UNIQUE%'
        LOOP
          EXECUTE 'DROP INDEX IF EXISTS ' || quote_ident(idx);
        END LOOP;
      END $$;
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_organizations_ownerId_unique"
      ON "organizations" ("ownerId")
    `);

    // eslint-disable-next-line no-console
    console.log(`[BackfillPersonalOrgs] provisioned ${provisioned} personal org(s)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert the unique index back to a plain index; the backfilled orgs are
    // intentionally left in place (dropping user data on rollback is unsafe).
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_organizations_ownerId_unique"`,
    );
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_organizations_ownerId"
      ON "organizations" ("ownerId")
    `);
  }
}
