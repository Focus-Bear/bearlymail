import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateOrganizationAndMember1786000000000 implements MigrationInterface {
  name = "CreateOrganizationAndMember1786000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    // Create organizations table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "organizations" (
        "id"        uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name"      text NOT NULL,
        "ownerId"   uuid NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_organizations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_organizations_owner" FOREIGN KEY ("ownerId")
          REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_organizations_ownerId" ON "organizations" ("ownerId")`,
    );

    // Create organization_members table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "organization_members" (
        "id"             uuid NOT NULL DEFAULT uuid_generate_v4(),
        "organizationId" uuid NOT NULL,
        "userId"         uuid,
        "email"          text NOT NULL,
        "emailHash"      varchar NOT NULL,
        "role"           varchar NOT NULL DEFAULT 'member',
        "status"         varchar NOT NULL DEFAULT 'pending',
        "displayName"    text,
        "inviteToken"    varchar,
        "inviteExpires"  TIMESTAMP,
        "invitedBy"      uuid NOT NULL,
        "createdAt"      TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"      TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_organization_members" PRIMARY KEY ("id"),
        CONSTRAINT "FK_org_members_organization" FOREIGN KEY ("organizationId")
          REFERENCES "organizations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_org_members_user" FOREIGN KEY ("userId")
          REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_org_members_invitedBy" FOREIGN KEY ("invitedBy")
          REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_org_members_orgId_emailHash"
        ON "organization_members" ("organizationId", "emailHash")`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_org_members_orgId_status"
        ON "organization_members" ("organizationId", "status")`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_org_members_inviteToken"
        ON "organization_members" ("inviteToken")
        WHERE "inviteToken" IS NOT NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "organization_members"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "organizations"`);
  }
}
